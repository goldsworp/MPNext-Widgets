/**
 * Server-side proxy for the `customcss` attribute's fetch.
 *
 * The widget injects customcss into its own Shadow DOM as a Constructable
 * Stylesheet, which requires the CSS text as a JS string — unlike a plain
 * `<link rel="stylesheet">` (how the classic MP widgets' own customcss
 * works), that requires the host to send CORS headers permitting a
 * cross-origin `fetch()`. MinistryPlatform's static file host (where an
 * admin's existing customcss file for the classic widgets already lives)
 * doesn't send those — so a direct browser fetch fails outright. Routing
 * through our own server sidesteps that: server-to-server requests aren't
 * subject to CORS at all.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  resolveRequestOrigin,
  isOriginAllowed,
  buildOptionsResponse,
  buildFallbackCorsHeaders,
  getCorsHeaders,
} from "@/lib/embed/auth";
import { allowedOrigins } from "@/lib/embed/config";

const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2MB — generous for a CSS file

// Basic SSRF guard: this endpoint fetches whatever URL a widget is
// configured with, so it must not be usable to reach internal/private
// network addresses (including cloud metadata services).
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
];

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
}

export async function OPTIONS(req: NextRequest) {
  return buildOptionsResponse(req);
}

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);
  const fallbackCors = buildFallbackCorsHeaders(origin);

  const originAllowed = isOriginAllowed(origin, allowedOrigins);
  if (!originAllowed && process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: `Origin ${origin} not allowed` },
      { status: 403, headers: fallbackCors },
    );
  }

  const corsHeaders = getCorsHeaders(origin);
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400, headers: corsHeaders },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid url parameter" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http/https URLs are supported" },
      { status: 400, headers: corsHeaders },
    );
  }

  if (isBlockedHostname(parsed.hostname)) {
    return NextResponse.json(
      { error: "This host cannot be fetched" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(parsed.toString(), { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: 502, headers: corsHeaders },
      );
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return NextResponse.json(
        { error: "Response too large" },
        { status: 502, headers: corsHeaders },
      );
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch customcss" },
      { status: 502, headers: corsHeaders },
    );
  }
}
