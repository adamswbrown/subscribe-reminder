// Behind Railway's proxy, request.url reflects the container's bind address
// (0.0.0.0:3000), so public-facing URLs must come from forwarded headers.

export function originFromHeaders(h: Headers): string | null {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

export function requestOrigin(request: Request): string {
  return originFromHeaders(request.headers) ?? new URL(request.url).origin;
}
