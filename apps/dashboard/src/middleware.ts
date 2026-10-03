import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "./lib/i18n/locales";

function detectLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const preferred = acceptLanguage.split(",")[0]?.split("-")[0]?.toLowerCase();
  return preferred && isLocale(preferred) ? preferred : DEFAULT_LOCALE;
}

/**
 * A13.7: a fresh nonce per request, not a fixed value — Next.js's own
 * app-router docs document this exact pattern (middleware generates the
 * nonce and sets it on both the forwarded request headers, so a Server
 * Component can read it via `headers()`, and the response's own CSP
 * header). Next automatically applies this nonce to the script tags it
 * injects for hydration; `src/app/[locale]/layout.tsx` reading the header
 * is what's required to opt the route tree out of static prerendering —
 * a build-time nonce baked into cached static HTML would never match a
 * fresh per-request CSP header, so this cannot be both static and secure.
 */
function buildCspHeader(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self' ${process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3001"}`,
    `base-uri 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  if (firstSegment && isLocale(firstSegment)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", cspHeader);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", cspHeader);
    return response;
  }

  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const response = NextResponse.redirect(url);
  response.headers.set("content-security-policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
