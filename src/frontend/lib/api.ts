/**
 * API base URL for client-side simulator calls.
 * Inlined at build time from NEXT_PUBLIC_API_URL.
 */
export const API_BASE_URL: string = (
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001"
).replace(/\/+$/, "");

/** Build an absolute API URL from a path such as "/api/v1/scenarios". */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
