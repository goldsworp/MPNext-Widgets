/**
 * Space Availability reservation-request endpoint for embed widgets
 * POST /api/embed/space-availability/request?eventTypeId=<id>&programId=<id>[&visibilityLevelId=<id>][&defaultContactId=<id>][&notifyEmails=a@b.com,c@d.com][&requireSignIn=true]
 *   { roomId, date, startTime, endTime, setupMinutes, cleanupMinutes, requestorName, requestorEmail, requestorPhone?, notes? }
 *
 * Widget configuration (event type / program / visibility / default contact /
 * notify list) is passed as query params, same as the read-side route, since
 * these come from the widget's own attributes rather than the visitor's
 * form input.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { SpaceAvailabilityService } from "@/services/spaceAvailabilityService";
import { ReservationRequestInputSchema } from "@mpnext/types";

function parsePositiveInt(param: string | null): number | undefined {
  if (!param) return undefined;
  const n = parseInt(param, 10);
  return !isNaN(n) && n > 0 ? n : undefined;
}

// Visibility_Levels is a fixed, seeded MP lookup table with exactly 5 rows
// (1 Private – 5 Hidden: URL Required) — anything else isn't a real level.
function parseVisibilityLevelId(param: string | null): number {
  const n = param ? parseInt(param, 10) : NaN;
  return !isNaN(n) && n >= 1 && n <= 5 ? n : 1;
}

export async function POST(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: ["space-availability", "user-menu"] });

    const url = new URL(req.url);

    if (url.searchParams.get("requireSignIn") === "true" && claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const eventTypeId = parsePositiveInt(url.searchParams.get("eventTypeId"));
    const programId = parsePositiveInt(url.searchParams.get("programId"));
    const visibilityLevelId = parseVisibilityLevelId(url.searchParams.get("visibilityLevelId"));
    const defaultContactId = parsePositiveInt(url.searchParams.get("defaultContactId"));
    const notifyEmails = (url.searchParams.get("notifyEmails") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!eventTypeId || !programId) {
      return NextResponse.json(
        { error: "Missing required query parameters: eventTypeId and programId" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    if (claims.sub === "public" && !defaultContactId) {
      return NextResponse.json(
        { error: "This widget requires either sign-in or a configured default-contact-id to accept requests from anonymous visitors." },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = ReservationRequestInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body: " + parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await SpaceAvailabilityService.getInstance();
    const result = await service.createReservationRequest({
      ...parsed.data,
      userGuid: claims.sub === "public" ? null : claims.sub,
      defaultContactId: defaultContactId ?? null,
      eventTypeId,
      programId,
      visibilityLevelId,
      notifyEmails,
    });

    const headers: HeadersInit = getCorsHeaders(origin);
    const status = result.result === "ok" ? 200 : result.result === "conflict" ? 409 : 400;

    return NextResponse.json(result, { status, headers });
  } catch (error) {
    console.error("Error creating Space Availability reservation request:", error);

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
