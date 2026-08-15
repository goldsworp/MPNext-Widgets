/**
 * Unit tests for cdn-loader (packages/embed-sdk/src/shared/cdn-loader.ts)
 *
 * The module keeps a module-level Map<string, Promise<void>> cache, so each
 * test re-imports the module via vi.resetModules() to start from a clean slate.
 *
 * Note: the current implementation does NOT append a cache-busting query
 * string — that responsibility lives in the dedicated `cdn-loader.js` shipped
 * under public/embed-sdk. These tests assert the actual behavior of the
 * TypeScript helper (load + dedupe + reuse).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type CdnLoader = typeof import("./cdn-loader");

async function loadFresh(): Promise<CdnLoader> {
  vi.resetModules();
  return await import("./cdn-loader");
}

describe("cdn-loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure a clean <head> per test so duplicate-script detection is deterministic.
    document.head.innerHTML = "";
  });

  afterEach(() => {
    document.head.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("loadScript()", () => {
    it("creates a <script> with src, async=true and appends to <head>", async () => {
      const { loadScript } = await loadFresh();

      const promise = loadScript("https://cdn.example.com/widget.js");

      const scriptEl = document.head.querySelector(
        'script[src="https://cdn.example.com/widget.js"]',
      ) as HTMLScriptElement | null;
      expect(scriptEl).not.toBeNull();
      expect(scriptEl!.async).toBe(true);

      // Fire onload to resolve the promise.
      scriptEl!.onload?.(new Event("load"));
      await expect(promise).resolves.toBeUndefined();
    });

    it("rejects when the script fails to load", async () => {
      const { loadScript } = await loadFresh();

      const promise = loadScript("https://cdn.example.com/broken.js");

      const scriptEl = document.head.querySelector(
        'script[src="https://cdn.example.com/broken.js"]',
      ) as HTMLScriptElement | null;
      expect(scriptEl).not.toBeNull();

      scriptEl!.onerror?.(new Event("error"));
      await expect(promise).rejects.toThrow(
        "Failed to load script: https://cdn.example.com/broken.js",
      );
    });

    it("deduplicates concurrent calls for the same URL (cache hit)", async () => {
      const { loadScript } = await loadFresh();

      const p1 = loadScript("https://cdn.example.com/a.js");
      const p2 = loadScript("https://cdn.example.com/a.js");

      // Only one <script> tag should be injected.
      const scripts = document.head.querySelectorAll(
        'script[src="https://cdn.example.com/a.js"]',
      );
      expect(scripts.length).toBe(1);

      // Both calls return the same cached Promise instance.
      expect(p1).toBe(p2);

      (scripts[0] as HTMLScriptElement).onload?.(new Event("load"));
      await expect(p1).resolves.toBeUndefined();
      await expect(p2).resolves.toBeUndefined();
    });

    it("resolves immediately when a matching <script> already exists in the document", async () => {
      const { loadScript } = await loadFresh();

      // Pre-seed a script tag (without the helper).
      const existing = document.createElement("script");
      existing.src = "https://cdn.example.com/already.js";
      document.head.appendChild(existing);

      const promise = loadScript("https://cdn.example.com/already.js");

      // No second script tag should be injected.
      const matches = document.head.querySelectorAll(
        'script[src="https://cdn.example.com/already.js"]',
      );
      expect(matches.length).toBe(1);

      // Promise should resolve without us firing onload.
      await expect(promise).resolves.toBeUndefined();
    });

    it("treats different URLs as separate cache entries", async () => {
      const { loadScript } = await loadFresh();

      const pA = loadScript("https://cdn.example.com/a.js");
      const pB = loadScript("https://cdn.example.com/b.js");

      const elA = document.head.querySelector(
        'script[src="https://cdn.example.com/a.js"]',
      ) as HTMLScriptElement;
      const elB = document.head.querySelector(
        'script[src="https://cdn.example.com/b.js"]',
      ) as HTMLScriptElement;
      expect(elA).not.toBeNull();
      expect(elB).not.toBeNull();
      expect(elA).not.toBe(elB);

      elA.onload?.(new Event("load"));
      elB.onload?.(new Event("load"));
      await expect(pA).resolves.toBeUndefined();
      await expect(pB).resolves.toBeUndefined();
    });
  });

  describe("injectExternalCSS()", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("missing")) {
            return { ok: false, status: 404, text: async () => "" } as Response;
          }
          return { ok: true, text: async () => ".leaflet-pane { position: absolute; }" } as Response;
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("fetches the CSS and never appends a <link> child (jsdom-version-agnostic)", async () => {
      const { injectExternalCSS } = await loadFresh();

      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });

      await injectExternalCSS(shadow, "https://cdn.example.com/styles.css");

      // Not a DOM child — a <link> here would be destroyed by the component's
      // next `shadowRoot.innerHTML = ...` re-render, which is the whole bug
      // this approach avoids. Whether this jsdom version actually implements
      // adoptedStyleSheets varies, so accept either real path (matching the
      // conditional pattern base-widget.test.ts already uses for the same
      // feature-detected API).
      expect(shadow.querySelector("link")).toBeNull();
      const sheets = shadow.adoptedStyleSheets;
      if (sheets && sheets.length > 0) {
        expect(sheets[0].cssRules[0].cssText).toContain("position: absolute");
      } else {
        const style = shadow.querySelector("style");
        expect(style).not.toBeNull();
        expect(style!.textContent).toContain("position: absolute");
      }
    });

    it("appends to, rather than replaces, existing adopted stylesheets (constructable-stylesheet path)", async () => {
      // This jsdom version may not natively implement adoptedStyleSheets
      // (confirmed: a fresh shadow root's `.adoptedStyleSheets` reads back
      // undefined here) — force the feature-detected branch so the
      // spread-append logic itself, which is the actual fix for the bug
      // where a <link> got wiped by the widget's next render(), is verified
      // deterministically rather than silently skipped.
      const hadAdopted = "adoptedStyleSheets" in Document.prototype;
      const hadReplace = "replace" in CSSStyleSheet.prototype;
      if (!hadAdopted) {
        Object.defineProperty(Document.prototype, "adoptedStyleSheets", {
          value: [],
          writable: true,
          configurable: true,
        });
      }
      if (!hadReplace) {
        Object.defineProperty(CSSStyleSheet.prototype, "replace", {
          value: function (this: CSSStyleSheet) {
            return Promise.resolve(this);
          },
          writable: true,
          configurable: true,
        });
      }

      try {
        const { injectExternalCSS } = await loadFresh();

        const host = document.createElement("div");
        const shadow = host.attachShadow({ mode: "open" });
        const ownSheet = new CSSStyleSheet();
        ownSheet.replaceSync(".od-card { color: red; }");
        Object.defineProperty(shadow, "adoptedStyleSheets", {
          value: [ownSheet],
          writable: true,
          configurable: true,
        });

        await injectExternalCSS(shadow, "https://cdn.example.com/styles.css");

        expect(shadow.adoptedStyleSheets.length).toBe(2);
        expect(shadow.adoptedStyleSheets[0]).toBe(ownSheet);
      } finally {
        if (!hadAdopted) delete (Document.prototype as unknown as Record<string, unknown>).adoptedStyleSheets;
        if (!hadReplace) delete (CSSStyleSheet.prototype as unknown as Record<string, unknown>).replace;
      }
    });

    it("rejects when the CSS fetch fails", async () => {
      const { injectExternalCSS } = await loadFresh();

      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });

      await expect(
        injectExternalCSS(shadow, "https://cdn.example.com/missing.css"),
      ).rejects.toThrow("Failed to load CSS: https://cdn.example.com/missing.css");
    });
  });
});
