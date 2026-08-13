/**
 * Family Faith Formation endpoint for embed widgets
 * GET /api/embed/faith-formation?ministryId=<id>[&showLeaderEmail=false][&showLeaderMobilePhone=false]
 * Requires a signed-in user — returns their household's Faith Formation involvement.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { FaithFormationService } from "@/services/faithFormationService";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: "faith-formation" });

    if (claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const url = new URL(req.url);
    const ministryIdParam = url.searchParams.get("ministryId");
    const ministryId = parseInt(ministryIdParam || "", 10);

    if (!ministryIdParam || isNaN(ministryId) || ministryId <= 0) {
      return NextResponse.json(
        { error: "Missing required parameter: ministryId" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const showLeaderEmail = url.searchParams.get("showLeaderEmail") !== "false";
    const showLeaderMobilePhone = url.searchParams.get("showLeaderMobilePhone") !== "false";

    const service = await FaithFormationService.getInstance();
    const people = await service.getFamilyFaithFormation({
      userGuid: claims.sub,
      ministryId,
      showLeaderEmail,
      showLeaderMobilePhone,
    });

    const headers = {
      ...getCorsHeaders(origin),
      "Cache-Control": "private, max-age=60",
    };

    return NextResponse.json({ people }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Faith Formation data:", error);

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
