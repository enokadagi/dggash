import { clearStoredTokens, getStoredAccessToken, getStoredRefreshToken, setStoredTokens } from "@/lib/auth-storage";

function resolveBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:3001/api/v1");
  return configuredUrl.replace(/\/$/, '').endsWith('/api/v1')
    ? configuredUrl.replace(/\/$/, '')
    : `${configuredUrl.replace(/\/$/, '')}/api/v1`;
}

const BASE_URL = resolveBaseUrl();

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
  errors?: Record<string, string[]>;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(undefined);
    }
  });
  failedQueue = [];
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    const tokens = data.data || data;
    setStoredTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  const raw = await response.json();
  if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
    return raw.data as T;
  }
  return raw as T;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const token = getStoredAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined") {
    if (!isRefreshing) {
      isRefreshing = true;
      const success = await refreshAccessToken();
      isRefreshing = false;

      if (success) {
        processQueue(null);
        const newToken = getStoredAccessToken();
        headers["Authorization"] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, { ...options, headers });
        if (!retryResponse.ok) {
          const errorData = await retryResponse.json().catch(() => ({}));
          throw { message: errorData.message || "Request failed", statusCode: retryResponse.status };
        }
        return parseResponse<T>(retryResponse);
      } else {
        processQueue(new Error("Token refresh failed"));
        clearStoredTokens();
        // Only force a navigation when we are not already on an auth screen.
        // A hard redirect here while the login request is in flight aborts it
        // and leaves the user stuck on the login page.
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        throw { message: "Session expired", statusCode: 401 };
      }
    } else {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => fetchApi<T>(endpoint, options));
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw {
      message: errorData.message || "Request failed",
      statusCode: response.status,
      errors: errorData.errors,
    };
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return parseResponse<T>(response);
}

export const api = {
  get<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, String(value));
        }
      });
    }
    const query = searchParams.toString();
    return fetchApi<T>(`${endpoint}${query ? `?${query}` : ""}`);
  },

  post<T>(endpoint: string, data?: unknown): Promise<T> {
    return fetchApi<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return fetchApi<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  put<T>(endpoint: string, data?: unknown): Promise<T> {
    return fetchApi<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete<T>(endpoint: string): Promise<T> {
    return fetchApi<T>(endpoint, { method: "DELETE" });
  },

  upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const token = getStoredAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetchApi<T>(endpoint, {
      method: "POST",
      body: formData,
      headers,
    });
  },
};
