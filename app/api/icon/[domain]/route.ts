// Same-origin favicon proxy: client-side fetches to third-party icon hosts
// get blocked by content blockers and filtered networks, so we fetch
// server-side and cache. 404 on total failure lets the client fall back
// to a monogram.

const SOURCES = [
  (d: string) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
  (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=64`,
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;
  if (!/^[a-z0-9.-]{3,80}$/.test(domain) || !domain.includes(".")) {
    return new Response("Bad domain", { status: 400 });
  }

  for (const source of SOURCES) {
    try {
      const res = await fetch(source(domain), {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok && res.body) {
        return new Response(res.body, {
          headers: {
            "Content-Type": res.headers.get("content-type") ?? "image/x-icon",
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        });
      }
    } catch {
      // try the next source
    }
  }
  return new Response(null, { status: 404 });
}
