/**
 * Perpetual Adoration Calendar registration endpoint for embed widgets
 * POST /api/embed/perpetual-adoration/register  { eventIds: number[] }
 * Requires a signed-in user — registers them as the adorer for each eligible slot.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { PerpetualAdorationService } from "@/services/perpetualAdorationService";
import { z } from "zod";

const RegisterRequestSchema = z.object({
  eventIds: z.array(z.number().int().positive()).min(1),
});

export async function POST(req: NextRequest) {
  const origin = resolveRequestOrigin(req);

  try {
    const claims = await requireWidgetAuth(req, { widget: "perpetual-adoration" });

    if (claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = RegisterRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request: eventIds must be a non-empty array of positive integers" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await PerpetualAdorationService.getInstance();
    const result = await service.registerSlots({ userGuid: claims.sub, eventIds: parsed.data.eventIds });

    const headers: HeadersInit = getCorsHeaders(origin);

    return NextResponse.json(result, { status: 200, headers });
  } catch (error) {
    console.error("Error registering Perpetual Adoration slots:", error);

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
