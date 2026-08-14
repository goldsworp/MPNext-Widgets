/**
 * Single organization detail endpoint for embed widgets
 * GET /api/embed/organization-directory/:congregationId[?massEventTypeId=13][&requireSignIn=true]
 * Public by default — some dioceses choose to gate the directory behind
 * sign-in as a matter of site policy (the data itself isn't sensitive), via
 * the widget's `require-sign-in` attribute passed through as `requireSignIn`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { OrganizationDirectoryService } from "@/services/organizationDirectoryService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ congregationId: string }> }
) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: ["organization-directory", "organization-detail"] });

    const { congregationId: congregationIdParam } = await params;
    const congregationId = parseInt(congregationIdParam, 10);

    if (isNaN(congregationId) || congregationId <= 0) {
      return NextResponse.json(
        { error: "Invalid congregationId: must be a positive integer" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const url = new URL(req.url);

    if (url.searchParams.get("requireSignIn") === "true" && claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const massEventTypeIdParam = url.searchParams.get("massEventTypeId");
    const massEventTypeId = massEventTypeIdParam ? parseInt(massEventTypeIdParam, 10) : undefined;
    if (massEventTypeIdParam && (massEventTypeId === undefined || isNaN(massEventTypeId) || massEventTypeId <= 0)) {
      return NextResponse.json(
        { error: "Invalid 'massEventTypeId': must be a positive integer" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await OrganizationDirectoryService.getInstance();
    const organization = await service.getOrganizationDetail(congregationId, massEventTypeId);

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "public, max-age=300",
    };

    return NextResponse.json(organization, { status: 200, headers });
  } catch (error) {
    console.error("Error loading organization detail:", error);

    const status =
      error instanceof Error && error.message === "Organization not found"
        ? 404
        : error instanceof Error && error.message.includes("Token")
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status, headers: buildFallbackCorsHeaders(origin) }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return buildOptionsResponse(req);
}
