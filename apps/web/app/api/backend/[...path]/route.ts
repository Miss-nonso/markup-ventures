const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (
    !/^(auth\/(login|logout|me|demo)|assets|assets\/[0-9a-f-]+(?:\/(readings|platform|provision|revoke|maintenance))?|alerts|alerts\/[0-9a-f-]+\/acknowledge|dashboard|analytics|audit|events|metrics|telemetry\/history|demo\/seed)$/.test(
      endpoint,
    )
  )
    return new Response(null, { status: 404 });
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const key of ["cookie", "origin"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && body.length > 16384) return new Response(null, { status: 413 });
    const upstream = await fetch(
      `${api}/${endpoint}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "error",
        signal:
          endpoint === "events" ? request.signal : AbortSignal.timeout(10000),
      },
    );
    if (endpoint === "events")
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.ok
            ? "text/event-stream"
            : "application/json",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    const responseHeaders = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    for (const key of ["set-cookie", "retry-after"]) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "Backend unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;

export const PATCH = proxy;
