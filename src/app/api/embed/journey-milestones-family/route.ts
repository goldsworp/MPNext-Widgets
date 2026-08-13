/**
 * Journey Milestones (Family) endpoint for embed widgets
 * GET /api/embed/journey-milestones-family?journeyId=<id>&groupId=<id>
 * Requires a signed-in user — returns their household members who are
 * current participants of the group, each with their Journey milestones.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { JourneyMilestonesService } from "@/services/journeyMilestonesService";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: ["journey-milestones-family", "user-menu"] });

    if (claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const url = new URL(req.url);
    const journeyIdParam = url.searchParams.get("journeyId");
    const journeyId = parseInt(journeyIdParam || "", 10);
    const groupIdParam = url.searchParams.get("groupId");
    const groupId = parseInt(groupIdParam || "", 10);

    if (!journeyIdParam || isNaN(journeyId) || journeyId <= 0) {
      return NextResponse.json(
        { error: "Missing required parameter: journeyId" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    if (!groupIdParam || isNaN(groupId) || groupId <= 0) {
      return NextResponse.json(
        { error: "Missing required parameter: groupId" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await JourneyMilestonesService.getInstance();
    const members = await service.getFamilyMilestones({ userGuid: claims.sub, journeyId, groupId });

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "private, max-age=30",
    };

    return NextResponse.json({ members }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Journey Milestones (Family):", error);

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
