/**
 * Perpetual Adoration Calendar slots endpoint for embed widgets
 * GET /api/embed/perpetual-adoration?start=<ISO>&end=<ISO>[&congregationIds=4,8]
 * Requires a signed-in user — adoration slots and adorer names are not public.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { PerpetualAdorationService } from "@/services/perpetualAdorationService";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: "perpetual-adoration" });

    if (claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const url = new URL(req.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const congregationIdsParam = url.searchParams.get("congregationIds");

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing required query parameters: start and end" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'start' date" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    if (isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'end' date" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    if (startDate >= endDate) {
      return NextResponse.json(
        { error: "'start' must be before 'end'" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    let congregationIds: number[] | undefined;
    if (congregationIdsParam) {
      congregationIds = congregationIdsParam
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      if (congregationIds.length === 0) {
        return NextResponse.json(
          { error: "Invalid 'congregationIds': must be a comma-separated list of positive integers" },
          { status: 400, headers: buildFallbackCorsHeaders(origin) }
        );
      }
    }

    const service = await PerpetualAdorationService.getInstance();
    const slots = await service.getSlots({ startDate: start, endDate: end, congregationIds });

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "private, max-age=30",
    };

    return NextResponse.json({ slots }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Perpetual Adoration slots:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && error.message.includes("Token") ? 403 : 500,
        headers: buildFallbackCorsHeaders(origin),
      }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return buildOptionsResponse(req);
}
