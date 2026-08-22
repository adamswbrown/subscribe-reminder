// Behind Railway's proxy, request.url reflects the container's bind address
// (0.0.0.0:3000), so public-facing redirects must come from forwarded headers.
export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
