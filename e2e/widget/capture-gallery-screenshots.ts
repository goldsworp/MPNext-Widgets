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
    // The demo page shows two instances (main, toolbar-driven + a static
    // "cards" one) — the first has the view-switcher toolbar this test
    // drives through.
    const widget = page.locator("next-full-calendar").first();
    await expect(widget).toBeAttached();
    // The calendar grid renders asynchronously after the widget itself
    // attaches — wait for the month layout rather than a blind timeout,
    // which otherwise risks capturing only the toolbar before layout runs.
    await expect(widget.locator(".nw-fc-month-layout").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await shootWidget(widget, "full-calendar"); // Month (default) — mini-cal + card grid

    // The widget's own toolbar exposes 6 views total; Month is captured
    // above and Calendar is visually close to it (same split mini-cal +
    // cards layout), so these 4 are the most meaningfully different to show.
    // Grid/Week are the ONLY views that load the real FullCalendar.io
    // library on demand (everything else is the hand-built "nw-fc-*"
    // renderer) — they need a longer wait on first switch.
    await widget.locator('.nw-fc-toolbar-btn[data-view="grid"]').click();
    await expect(widget.locator(".fc-daygrid, .fc-view-harness").first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await shootWidget(widget, "full-calendar", "-2"); // Grid — real FullCalendar month grid

    await widget.locator('.nw-fc-toolbar-btn[data-view="week"]').click();
    await page.waitForTimeout(1500);
    await shootWidget(widget, "full-calendar", "-3"); // Week — real FullCalendar week grid

    await widget.locator('.nw-fc-toolbar-btn[data-view="list"]').click();
    await page.waitForTimeout(500);
    // The agenda list has no pagination — it renders every upcoming event
    // with nothing to stop it (20,000+ px tall in this dataset), so a full
    // widget.screenshot() would be unusably long. Clip to a fixed height
    // instead, capturing just the toolbar plus the first several days.
    {
      const box = await widget.boundingBox();
      if (!box) throw new Error("Could not measure full-calendar widget bounding box.");
      await page.screenshot({
        path: outPath("full-calendar", "-4"),
        clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 1400) },
      });
    }

    await widget.locator('.nw-fc-toolbar-btn[data-view="cards"]').click();
    await page.waitForTimeout(500);
    await shootWidget(widget, "full-calendar", "-5"); // Cards — card grid only
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

    // ── Image 1: availability results, showing the capacity filter ──
    // St. Joseph's Main Church has two rooms — Chapel (seats 80, no real
    // bookings) and Church (seats 1000, real recurring Masses booked) — so
    // a "seats 100+" filter cleanly narrows to just Church via "Select
    // all", and the resulting search shows genuine reservations rather
    // than "no reservations found".
    await widget.locator("select").nth(0).selectOption({ label: "St. Joseph" });
    await page.waitForTimeout(1000);
    await widget.locator("select").nth(1).selectOption({ label: "Main Church" });
    await page.waitForTimeout(1000);
    await widget.locator("#sa-room-min-capacity").fill("100");
    await page.waitForTimeout(300);
    await widget.locator("#sa-select-all-filtered").click();
    // "Church" hosts a recurring daily Mass, so d30 produces an absurdly
    // long results list (6700+ px) — d7 still shows several real, varied
    // bookings (daily Mass, Bible Study, weekend Masses) at a sane height.
    await widget.locator("#sa-quick-range").selectOption({ value: "d7" });
    await widget.getByRole("button", { name: /check availability/i }).click();
    await page.waitForTimeout(1500);
    await shootWidget(widget, "space-availability");

    // ── Image 2: the "Request This Space" form filled out ──
    // Needs allow-requests + program-id, which the default widget instance
    // above doesn't have — reconfigure via the demo's own controls and
    // Apply (recreates the widget fresh, built as an HTML string so every
    // attribute is present at construction time, per the comment in this
    // demo page's own reload handler).
    await page.locator("#allow-requests-input").selectOption({ value: "true" });
    await page.locator("#program-id-input").fill("10");
    await page.locator("#congregation-ids-input").fill("4"); // St. Joseph — skips straight to Building
    await page.locator("#reload-btn").click();
    await page.waitForTimeout(1500);

    const widget2 = page.locator("next-space-availability");
    await widget2.locator("#sa-building-select").selectOption({ label: "Main Church" });
    await page.waitForTimeout(1000);
    await widget2.locator('input[type="checkbox"]').first().check({ timeout: 5000 });
    await widget2.getByRole("button", { name: /check availability/i }).click();
    await page.waitForTimeout(1500);
    await widget2.getByRole("button", { name: /request this space/i }).click();
    await page.waitForTimeout(300);

    const form = widget2.locator("#sa-request-form");
    await form.locator("#sa-req-room").selectOption({ label: "Church" });
    await form.locator("#sa-req-date").fill("2026-09-10");
    await form.locator("#sa-req-start").selectOption({ value: "18:00" });
    await form.locator("#sa-req-end").selectOption({ value: "19:30" });
    await form.locator("#sa-req-setup").fill("15");
    await form.locator("#sa-req-cleanup").fill("15");
    await form.locator("#sa-req-name").fill("Jordan Rivera");
    await form.locator("#sa-req-email").fill("jordan.rivera@example.com");
    await form.locator("#sa-req-phone").fill("555-201-4488");
    await form.locator("#sa-req-notes").fill("Monthly parish council meeting — please set up the projector.");
    await page.waitForTimeout(200);
    await shootWidget(form, "space-availability", "-2");
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
