/**
 * Personnel Directory listing endpoint for embed widgets
 * GET /api/embed/personnel-directory[?personnelCategoryIds=1,2][&congregationIds=4,8]
 *     [&phoneSource=1][&phoneStrictSource=true][&alternateEmailTypeId=1][&requireSignIn=true]
 * Public by default — some dioceses choose to gate the directory behind
 * sign-in as a matter of site policy, via the widget's `require-sign-in`
 * attribute passed through as `requireSignIn`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { PersonnelDirectoryService, type PhoneSource } from "@/services/personnelDirectoryService";

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
    // whichever known widget tag appears first in the DOM — when
    // <next-user-menu> co-exists on a page (e.g. for require-sign-in), it
    // can "win" that resolution instead of this widget. Same fix as
    // organization-directory's routes.
    const claims = await requireWidgetAuth(req, { widget: ["personnel-directory", "user-menu"] });

    const url = new URL(req.url);
    const personnelCategoryIds = parsePositiveIntList(url.searchParams.get("personnelCategoryIds"));
    const congregationIds = parsePositiveIntList(url.searchParams.get("congregationIds"));

    if (url.searchParams.get("requireSignIn") === "true" && claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const phoneSourceParam = url.searchParams.get("phoneSource");
    const phoneSource = (phoneSourceParam ? parseInt(phoneSourceParam, 10) : 1) as PhoneSource;
    if (![1, 2, 3].includes(phoneSource)) {
      return NextResponse.json(
        { error: "Invalid 'phoneSource': must be 1, 2, or 3" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const phoneStrictSource = url.searchParams.get("phoneStrictSource") === "true";

    const alternateEmailTypeIdParam = url.searchParams.get("alternateEmailTypeId");
    const alternateEmailTypeId = alternateEmailTypeIdParam ? parseInt(alternateEmailTypeIdParam, 10) : undefined;
    if (alternateEmailTypeIdParam && (alternateEmailTypeId === undefined || isNaN(alternateEmailTypeId) || alternateEmailTypeId <= 0)) {
      return NextResponse.json(
        { error: "Invalid 'alternateEmailTypeId': must be a positive integer" },
        { status: 400, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await PersonnelDirectoryService.getInstance();
    const personnel = await service.getPersonnel({
      personnelCategoryIds,
      congregationIds,
      phoneSource,
      phoneStrictSource,
      alternateEmailTypeId,
    });

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "private, max-age=60",
    };

    return NextResponse.json({ personnel }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Personnel Directory listing:", error);

    // An expired token maps to 401 (not 403) specifically so the widget's
    // built-in fetch() retry-on-401 silently refreshes and retries instead
    // of surfacing a hard error for what's normally a transient condition.
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
