/**
 * Mass Intention Calendar events endpoint for embed widgets
 * GET /api/embed/mass-intention-calendar?start=<ISO>&end=<ISO>&eventTypeId=<id>[&congregationIds=4,8]
 * Public widget auth — no user sign-in required.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { MassIntentionCalendarService } from "@/services/massIntentionCalendarService";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    await requireWidgetAuth(req, { widget: "mass-intention-calendar" });

    const url = new URL(req.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const eventTypeIdParam = url.searchParams.get("eventTypeId");
    const congregationIdsParam = url.searchParams.get("congregationIds");

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing required query parameters: start and end" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const eventTypeId = parseInt(eventTypeIdParam || "", 10);
    if (!eventTypeIdParam || isNaN(eventTypeId) || eventTypeId <= 0) {
      return NextResponse.json(
        { error: "Missing required query parameter: eventTypeId" },
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

    const service = await MassIntentionCalendarService.getInstance();
    const events = await service.getMassEvents({ startDate: start, endDate: end, eventTypeId, congregationIds });

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "public, max-age=60",
    };

    return NextResponse.json({ events }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Mass Intention Calendar events:", error);

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
