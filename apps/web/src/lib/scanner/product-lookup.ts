import { api } from "@/lib/api";
import { normalizeScannedValue } from "@/lib/barcode";
import type { Product } from "@/hooks/api/use-products";

export type BarcodeLookupFailure =
  | "invalid"
  | "not-found"
  | "network"
  | "unauthorized";

export interface BarcodeLookupResult {
  ok: boolean;
  product: Product | null;
  /** The normalised value that was actually looked up. */
  code: string;
  reason?: BarcodeLookupFailure;
  message?: string;
}

/**
 * Canonical backend product lookup for *every* scanning surface.
 *
 * Both the USB keyboard-wedge detector (HENEX 2D) and the camera
 * barcode/QR component call this, so a product resolves identically no matter
 * how the code arrived. It also normalises the QR label payload produced by
 * `lib/barcode` down to a plain identifier first, so a printed label and its
 * barcode resolve to the same product.
 *
 * Never throws: failures are returned as a typed result so the POS screen can
 * show a clear message instead of breaking the open sale.
 */
export async function lookupProductByCode(rawCode: string): Promise<BarcodeLookupResult> {
  const code = normalizeScannedValue(rawCode ?? "");

  if (!code) {
    return {
      ok: false,
      product: null,
      code: "",
      reason: "invalid",
      message: "Empty barcode.",
    };
  }

  // Guard rail: a scan payload must be a sane length. Anything wildly long is a
  // mis-trigger (stray keystroke burst), not a barcode.
  if (code.length > 256) {
    return {
      ok: false,
      product: null,
      code,
      reason: "invalid",
      message: "Barcode is too long to be valid.",
    };
  }

  try {
    const product = await api.get<Product | null>(
      `/products/lookup?q=${encodeURIComponent(code)}`
    );

    if (!product) {
      return {
        ok: false,
        product: null,
        code,
        reason: "not-found",
        message: `No product found for "${code}".`,
      };
    }

    if (product.currentStock <= 0) {
      return {
        ok: false,
        product,
        code,
        reason: "not-found",
        message: `"${product.name}" is out of stock.`,
      };
    }

    return { ok: true, product, code };
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;

    if (statusCode === 401 || statusCode === 403) {
      return {
        ok: false,
        product: null,
        code,
        reason: "unauthorized",
        message: "Session expired. Sign in again to keep scanning.",
      };
    }

    return {
      ok: false,
      product: null,
      code,
      reason: "network",
      message: "Could not reach the server. Check the connection and try again.",
    };
  }
}
