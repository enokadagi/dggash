"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#71717a", margin: "0 0 20px" }}>
            An unexpected error occurred. Your data was not lost. Please try again.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid #d4d4d8",
                background: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid #18181b",
                background: "#18181b",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
