/**
 * Organization Directory listing endpoint for embed widgets
 * GET /api/embed/organization-directory[?locationCategoryIds=1,6,7][&congregationIds=4,8][&requireSignIn=true]
 * Public by default — some dioceses choose to gate the directory behind
 * sign-in as a matter of site policy (the data itself isn't sensitive), via
 * the widget's `require-sign-in` attribute passed through as `requireSignIn`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWidgetAuth, getCorsHeaders, resolveRequestOrigin, buildOptionsResponse, buildFallbackCorsHeaders } from "@/lib/embed/auth";
import { OrganizationDirectoryService } from "@/services/organizationDirectoryService";

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
    // "user-menu" is allowed alongside this widget's own names because the
    // SDK's token provider resolves a single shared `wid` per page from
    // whichever known widget tag appears first in the DOM — when
    // <next-user-menu> co-exists on a page (e.g. for require-sign-in), it
    // can "win" that resolution instead of this widget. Same fix as
    // mass-intention-calendar and perpetual-adoration's routes.
    const claims = await requireWidgetAuth(req, {
      widget: ["organization-directory", "organization-detail", "user-menu"],
    });

    const url = new URL(req.url);
    const locationCategoryIds = parsePositiveIntList(url.searchParams.get("locationCategoryIds"));
    const congregationIds = parsePositiveIntList(url.searchParams.get("congregationIds"));

    if (url.searchParams.get("requireSignIn") === "true" && claims.sub === "public") {
      return NextResponse.json(
        { error: "Sign-in required" },
        { status: 401, headers: buildFallbackCorsHeaders(origin) }
      );
    }

    const service = await OrganizationDirectoryService.getInstance();
    const organizations = await service.getOrganizations({ locationCategoryIds, congregationIds });

    const headers: HeadersInit = {
      ...getCorsHeaders(origin),
      "Cache-Control": "public, max-age=300",
    };

    return NextResponse.json({ organizations }, { status: 200, headers });
  } catch (error) {
    console.error("Error loading Organization Directory listing:", error);

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
