/**
 * Space Availability endpoint for embed widgets
 * GET /api/embed/space-availability?resource=congregations[&congregationIds=4,8]
 * GET /api/embed/space-availability?resource=buildings&congregationId=4[&congregationIds=4,8]
 * GET /api/embed/space-availability?resource=rooms&buildingId=3
 * GET /api/embed/space-availability?resource=availability&roomIds=10,11&start=<ISO>&end=<ISO>[&showDetailedInfo=false]
 * Public by default — gated behind sign-in via the widget's `require-sign-in`
 * attribute (passed through as `requireSignIn`), same optional pattern as
 * organization-directory's route.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { SpaceAvailabilityService } from "@/services/spaceAvailabilityService";

function parsePositiveInt(param: string | null): number | undefined {
  if (!param) return undefined;
  const n = parseInt(param, 10);
  return !isNaN(n) && n > 0 ? n : undefined;
}

function parsePositiveIntList(param: string | null): number[] | undefined {
  if (!param) return undefined;
  const ids = param
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    // "user-menu" is allowed alongside this widget's own name because the
    // SDK's token provider resolves a single shared `wid` per page from
    // whichever known widget tag appears first in the DOM — same fix as
    // organization-directory/mass-intention-calendar/perpetual-adoration.
    const claims = await requireWidgetAuth(req, { widget: ["space-availability", "user-menu"] });

    const url = new URL(req.url);

    if (url.searchParams.get("requireSignIn") === "true" && claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const resource = url.searchParams.get("resource");
    const service = await SpaceAvailabilityService.getInstance();
    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "private, max-age=30",
    };

    switch (resource) {
      case "me": {
        if (claims.sub === "public") {
          return NextResponse.json({ signedIn: false, contact: null }, { status: 200, headers });
        }
        const contact = await service.getCurrentContact(claims.sub);
        return NextResponse.json({ signedIn: true, contact }, { status: 200, headers });
      }

      case "congregations": {
        const congregationIds = parsePositiveIntList(url.searchParams.get("congregationIds"));
        const congregations = await service.getCongregations(congregationIds);
        return NextResponse.json({ congregations }, { status: 200, headers });
      }

      case "buildings": {
        const congregationId = parsePositiveInt(url.searchParams.get("congregationId"));
        if (!congregationId) {
          return NextResponse.json(
            { error: "Missing required query parameter: congregationId" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }
        const congregationIds = parsePositiveIntList(url.searchParams.get("congregationIds"));
        const buildings = await service.getBuildings(congregationId, congregationIds);
        return NextResponse.json({ buildings }, { status: 200, headers });
      }

      case "rooms": {
        const buildingId = parsePositiveInt(url.searchParams.get("buildingId"));
        if (!buildingId) {
          return NextResponse.json(
            { error: "Missing required query parameter: buildingId" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }
        const rooms = await service.getRooms(buildingId);
        return NextResponse.json({ rooms }, { status: 200, headers });
      }

      case "availability": {
        const roomIds = parsePositiveIntList(url.searchParams.get("roomIds"));
        const start = url.searchParams.get("start");
        const end = url.searchParams.get("end");
        const showDetailedInfo = url.searchParams.get("showDetailedInfo") !== "false";

        if (!roomIds || roomIds.length === 0) {
          return NextResponse.json(
            { error: "Missing required query parameter: roomIds" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }
        if (!start || !end) {
          return NextResponse.json(
            { error: "Missing required query parameters: start and end" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }

        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return NextResponse.json(
            { error: "Invalid 'start' or 'end' date" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }
        if (startDate >= endDate) {
          return NextResponse.json(
            { error: "'start' must be before 'end'" },
            { status: 400, headers: buildFallbackCorsHeaders(origin) }
          );
        }

        const blocks = await service.getAvailability({ roomIds, start, end, showDetailedInfo });
        return NextResponse.json({ blocks }, { status: 200, headers });
      }

      default:
        return NextResponse.json(
          { error: "Missing or invalid 'resource' query parameter: must be congregations, buildings, rooms, or availability" },
          { status: 400, headers: buildFallbackCorsHeaders(origin) }
        );
    }
  } catch (error) {
    console.error("Error loading Space Availability data:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      {
        status:
          error instanceof Error && /expired/i.test(error.message)
            ? 401
            : error instanceof Error && error.message.includes("Token")
              ? 403
              : 500,
        headers: buildFallbackCorsHeaders(origin),
      }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return buildOptionsResponse(req);
}
