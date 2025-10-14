interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
}

const CSP = "default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; worker-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'";
const CACHE_HTML = 'no-cache';
const CACHE_ASSET = 'public, max-age=31536000, immutable';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD, OPTIONS' } });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders('text/plain') });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const headers = new Headers(assetResponse.headers);
    const contentType = headers.get('Content-Type') || 'application/octet-stream';
    const isHTML = contentType.includes('text/html');
    headers.set('Content-Type', contentType);
    headers.set('Content-Security-Policy', CSP);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', isHTML ? CACHE_HTML : CACHE_ASSET);

    return new Response(assetResponse.body, {
      headers,
      status: assetResponse.status,
      statusText: assetResponse.statusText,
    });
  },
} satisfies ExportedHandler<Env>;

function baseHeaders(contentType: string): HeadersInit {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': CSP,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': CACHE_HTML,
  };
}
