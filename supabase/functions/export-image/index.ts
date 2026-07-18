const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ALLOWED_HOSTS = [
  "cdn.nba.com",
  "ak-static.cms.nba.com",
  "gleague.nba.com",
  "official.nba.com",
];
const MAX_REDIRECTS = 4;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

function configuredSupabaseHost() {
  try {
    return new URL(Deno.env.get("SUPABASE_URL") || "").hostname.toLowerCase();
  } catch {
    return "";
  }
}

function responseWithHeaders(status: number, body: BodyInit | null, extraHeaders: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return responseWithHeaders(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
  });
}

function isAllowedTarget(target: URL) {
  const host = target.hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(host)) return true;
  if (host && host === configuredSupabaseHost()) return true;
  return false;
}

async function fetchAllowedTarget(initialTarget: URL) {
  let target = initialTarget;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (target.protocol !== "https:" || !isAllowedTarget(target)) {
      throw new Error("Redirect target host not allowed");
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Export Proxy)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (upstream.status < 300 || upstream.status >= 400) {
      return { upstream, target };
    }

    const location = upstream.headers.get("location");
    if (!location) throw new Error("Image redirect did not include a destination");
    target = new URL(location, target);
  }

  throw new Error("Image request exceeded the redirect limit");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return responseWithHeaders(200, "ok");
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const requestUrl = new URL(req.url);
  const rawTarget = String(requestUrl.searchParams.get("url") || "").trim();

  if (!rawTarget) {
    return jsonResponse(400, { error: "Missing url" });
  }

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    return jsonResponse(400, { error: "Invalid url" });
  }

  if (!/^https:$/.test(target.protocol)) {
    return jsonResponse(400, { error: "Only https URLs are allowed" });
  }

  if (!isAllowedTarget(target)) {
    return jsonResponse(403, { error: "Target host not allowed" });
  }

  try {
    const { upstream, target: finalTarget } = await fetchAllowedTarget(target);

    if (!upstream.ok) {
      return jsonResponse(upstream.status, {
        error: `Upstream request failed (${upstream.status})`,
        source: finalTarget.toString(),
      });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return jsonResponse(415, { error: "Upstream response was not an image" });
    }
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      return jsonResponse(413, { error: "Upstream image exceeded the size limit" });
    }
    const cacheControl = upstream.headers.get("cache-control") || "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400";
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return jsonResponse(413, { error: "Upstream image exceeded the size limit" });
    }

    return responseWithHeaders(200, body, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    });
  } catch (error) {
    return jsonResponse(502, {
      error: "Unable to fetch image",
      detail: error instanceof Error ? error.message : "unknown",
      source: target.toString(),
    });
  }
});
