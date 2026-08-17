/**
 * Captures hero screenshots of each widget's Vite demo page for the public
 * /gallery route (public/gallery/{slug}[-2].png).
 *
 * Run with: npx playwright test --project=gallery-capture
 *
 * Lives alongside e2e/widget/*.spec.ts and shares the "widget" project's
 * baseURL (http://localhost:5173) and webServer auto-start from
 * playwright.config.ts, but runs under its own "gallery-capture" project
 * (with an explicit testMatch) so it's never picked up by
 * `pnpm test:e2e:widget`'s normal auto-discovery — this is a one-off
 * asset-generation script, not a test to run in CI.
 *
 * Screenshots the WIDGET ELEMENT itself (locator.screenshot()), not the
 * whole demo page — that skips the harness's own chrome (title,
 * description, attribute controls) and captures the widget's full content
 * even where it extends below the viewport, which page.screenshot()
 * without fullPage wouldn't reach.
 *
 * The 6 sign-in-required widgets (Profile, My Invoices, Faith Formation,
 * Perpetual Adoration, both Milestone Trackers) additionally need
 * PLAYWRIGHT_MP_USERNAME / PLAYWRIGHT_MP_PASSWORD set in .env.local (a
 * dedicated, MFA-disabled, non-admin MP test account — see CLAUDE.md).
 * If they're unset, those tests are skipped (not failed) so the rest of
 * the gallery can still be regenerated.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import path from "path";

const OUTPUT_DIR = path.join(__dirname, "..", "..", "public", "gallery");
const HAS_MP_CREDENTIALS = !!(process.env.PLAYWRIGHT_MP_USERNAME && process.env.PLAYWRIGHT_MP_PASSWORD);

function outPath(slug: string, suffix = ""): string {
  return path.join(OUTPUT_DIR, `${slug}${suffix}.png`);
}

async function shootWidget(widget: Locator, slug: string, suffix = ""): Promise<void> {
  await widget.screenshot({ path: outPath(slug, suffix) });
}

/**
 * Signs in through next-user-menu's real MinistryPlatform OAuth flow using
 * the dedicated Playwright test account. Best-effort against MP's actual
 * login form — field selectors are kept generic (type-based, not ID-based)
 * since this repo has no prior example of automating this specific flow.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/demo-user-menu.html");
  const loginTrigger = page.locator("next-user-menu").locator("button, a").first();
  await loginTrigger.click({ timeout: 10_000 }).catch(() => {
    // Widget markup may differ; fall back to a generic text match.
    return page.getByText(/sign in|log in/i).first().click({ timeout: 10_000 });
  });

  await page.waitForURL(/ministryplatform/i, { timeout: 15_000 });
  await page.locator('input[type="email"], input[type="text"][name*="user" i], input[id*="user" i]').first()
    .fill(process.env.PLAYWRIGHT_MP_USERNAME!);
  await page.locator('input[type="password"]').first().fill(process.env.PLAYWRIGHT_MP_PASSWORD!);
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL(/demo-user-menu\.html/i, { timeout: 15_000 });
}

test.describe("Gallery screenshots — no sign-in required", () => {
  test("add-to-calendar", async ({ page }) => {
    await page.goto("/demo-add-to-calendar.html");
    const widget = page.locator("next-add-to-calendar");
    await expect(widget).toBeAttached();
    // The demo page's default event-id="1" doesn't exist on this MP
    // instance ("Event not found") — point it at a real one instead.
    // Must wait for the initial event-id=1 fetch to fully settle before
    // overriding the attribute: the widget's attributeChangedCallback kicks
    // off a second, independent fetch, and if the stale one (a fast 404)
    // resolves after it, its error clobbers the correct render. (Rewriting
    // the attribute in the served HTML via page.route() avoids the race but
    // trips a Chrome Private Network Access check that breaks the widget's
    // real fetch entirely — not worth it here.)
    await expect(widget.locator(".nw-atcb-error, .nw-atcb-root > *:not(.nw-atcb-loading)")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(() => document.querySelector("next-add-to-calendar")?.setAttribute("event-id", "562"));
    // The real fetch + CDN script load for the add-to-calendar-button
    // library takes longer than the widget's initial (fast, failing) fetch —
    // 1500ms wasn't enough and captured a stale render; 3000ms is reliable.
    await page.waitForTimeout(3000);

    // Show the button pressed with its full options list open, not just the
    // collapsed button — Playwright's locator.click() dispatches a real
    // (trusted) click, which the ATCB library requires; a JS-level
    // .click()/dispatchEvent() call does not open the dropdown.
    const atcbButton = widget.locator("button.atcb-button");
    await atcbButton.click();
    const dropdown = widget.locator(".atcb-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300);

    // The dropdown has a frosted-glass (backdrop-blur) background, so the
    // rest of the demo page (Event Log panel, JSON output, etc.) shows
    // through blurred behind it — hide every sibling up the widget's own
    // ancestor chain so the screenshot's backdrop is clean.
    await page.evaluate(() => {
      let el: Element | null = document.querySelector("next-add-to-calendar");
      while (el && el !== document.body) {
        const parent: Element | null = el.parentElement;
        if (parent) {
          Array.from(parent.children).forEach((sibling) => {
            if (sibling !== el) (sibling as HTMLElement).style.visibility = "hidden";
          });
        }
        el = parent;
      }
    });

    // The open dropdown is an absolutely positioned overlay that extends
    // outside the <next-add-to-calendar> element's own layout box, so a
    // plain widget.screenshot() would crop it off — clip to the union of
    // the button's and the dropdown's bounding boxes instead. (Not the
    // widget host's own box: its :host is `display:block`, so it stretches
    // to its container's full width — cropping to that would mostly show
    // empty space beside the button.)
    const [buttonBox, dropdownBox] = await Promise.all([atcbButton.boundingBox(), dropdown.boundingBox()]);
    if (!buttonBox || !dropdownBox) throw new Error("Could not measure button/dropdown bounding boxes.");
    const x = Math.min(buttonBox.x, dropdownBox.x);
    const y = Math.min(buttonBox.y, dropdownBox.y);
    const right = Math.max(buttonBox.x + buttonBox.width, dropdownBox.x + dropdownBox.width);
    const bottom = Math.max(buttonBox.y + buttonBox.height, dropdownBox.y + dropdownBox.height);
    const pad = 8;
    await page.screenshot({
      path: outPath("add-to-calendar"),
      // The dropdown's bottom edge can fall below the viewport's visible
      // height (it's tall — 7 options plus a footer) — fullPage renders the
      // whole scrollable page first so clip isn't limited to what's
      // currently in view.
      fullPage: true,
      clip: { x: x - pad, y: y - pad, width: right - x + pad * 2, height: bottom - y + pad * 2 },
    });
  });

  test("full-calendar", async ({ page }) => {
    await page.goto("/demo-full-calendar.html");
    // The demo page shows two instances (main month view + a "cards" view) —
    // the first is the one worth screenshotting.
    const widget = page.locator("next-full-calendar").first();
    await expect(widget).toBeAttached();
    // The calendar grid renders asynchronously after the widget itself
    // attaches (this is a hand-built "nw-fc-*" calendar, not the
    // FullCalendar library despite the name) — wait for the month layout
    // rather than a blind timeout, which otherwise risks capturing only
    // the toolbar before layout runs.
    await expect(widget.locator(".nw-fc-month-layout").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await shootWidget(widget, "full-calendar");
  });

  test("mass-intention-calendar", async ({ page }) => {
    await page.goto("/demo-mass-intention-calendar.html");
    const widget = page.locator("next-mass-intention-calendar");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2500);
    await shootWidget(widget, "mass-intention-calendar");
  });

  test("organization-directory", async ({ page }) => {
    await page.goto("/demo-organization-directory.html");
    const widget = page.locator("next-organization-directory");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(3000); // map tiles + geocoding
    await shootWidget(widget, "organization-directory");
  });

  test("organization-detail", async ({ page }) => {
    await page.goto("/demo-organization-detail.html?id=1");
    const widget = page.locator("next-organization-detail");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2500);
    await shootWidget(widget, "organization-detail");
  });

  test("personnel-directory", async ({ page }) => {
    await page.goto("/demo-personnel-directory.html");
    const widget = page.locator("next-personnel-directory");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "personnel-directory");
  });

  test("space-availability", async ({ page }) => {
    await page.goto("/demo-space-availability.html");
    const widget = page.locator("next-space-availability");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(1500);

    // Drive it to a populated results view rather than the blank first step:
    // pick a congregation (renders a building <select>), pick a building
    // (renders the room list + date range), check a room, then search.
    // St. Leo / Parish Hall / Room A is known to have real bookings on the
    // demo instance, so the resulting screenshot shows actual reservations
    // rather than "no reservations found".
    await widget.locator("select").nth(0).selectOption({ label: "St. Leo" });
    await page.waitForTimeout(1000);
    await widget.locator("select").nth(1).selectOption({ label: "Parish Hall" });
    await page.waitForTimeout(1000);
    await widget.locator('input[type="checkbox"]').first().check({ timeout: 5000 });
    await widget.locator("#sa-quick-range").selectOption({ value: "d30" });
    await widget.getByRole("button", { name: /check availability/i }).click();
    await page.waitForTimeout(1500);
    await shootWidget(widget, "space-availability");
  });

  test("user-menu", async ({ page }) => {
    await page.goto("/demo-user-menu.html");
    const widget = page.locator("next-user-menu");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(1000);
    await shootWidget(widget, "user-menu");
  });
});

test.describe("Gallery screenshots — sign-in required", () => {
  test.skip(!HAS_MP_CREDENTIALS, "PLAYWRIGHT_MP_USERNAME/PLAYWRIGHT_MP_PASSWORD not set in .env.local");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("profile", async ({ page }) => {
    await page.goto("/demo-profile.html");
    const widget = page.locator("next-profile");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "profile");
  });

  test("my-invoices", async ({ page }) => {
    await page.goto("/demo-my-invoices.html");
    const widget = page.locator("next-my-invoices");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "my-invoices");
  });

  test("faith-formation", async ({ page }) => {
    await page.goto("/demo-faith-formation.html");
    const widget = page.locator("next-faith-formation");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "faith-formation");
  });

  test("perpetual-adoration", async ({ page }) => {
    await page.goto("/demo-perpetual-adoration.html");
    const widget = page.locator("next-perpetual-adoration");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "perpetual-adoration");
  });

  test("journey-milestones-individual", async ({ page }) => {
    await page.goto("/demo-journey-milestones-individual.html");
    const widget = page.locator("next-journey-milestones-individual");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "journey-milestones-individual");
  });

  test("journey-milestones-family", async ({ page }) => {
    await page.goto("/demo-journey-milestones-family.html");
    const widget = page.locator("next-journey-milestones-family");
    await expect(widget).toBeAttached();
    await page.waitForTimeout(2000);
    await shootWidget(widget, "journey-milestones-family");
  });
});
