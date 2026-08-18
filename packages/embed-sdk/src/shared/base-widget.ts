import { fetchCSSText } from "./cdn-loader";

function supportsConstructableStylesheets(): boolean {
  return "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
}

/**
 * Base class for MPNext embeddable widgets
 * Handles Shadow DOM, API communication, and token management
 */
export abstract class MPNextWidget extends HTMLElement {
  protected root: ShadowRoot;
  protected apiHost: string;
  protected tokenProvider: () => Promise<string>;

  private baseStyleSheet: CSSStyleSheet | null = null;
  private customStyleSheet: CSSStyleSheet | null = null;
  private customCssUrl: string | null = null;
  private customCssStyleTagEl: HTMLStyleElement | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });

    // Determine API host: element attribute → script tag origin → empty
    this.apiHost =
      this.getAttribute("api-host") ||
      this.detectApiHostFromScript() ||
      "";

    // Token provider — resolved lazily via waitForTokenProvider()
    this.tokenProvider =
      window.__nextTokenProvider?.get ||
      (async () => {
        console.warn("No token provider initialized.");
        return this.getAttribute("token") || "";
      });
  }

  /**
   * Derive the API host from the SDK script's own URL.
   */
  private detectApiHostFromScript(): string {
    // Prefer host set by the cache-busting loader
    if ((window as any).__nextEmbedApiHost) {
      return (window as any).__nextEmbedApiHost;
    }

    const scripts = document.querySelectorAll<HTMLScriptElement>(
      'script[src*="next-embed"]',
    );
    for (const s of scripts) {
      try {
        return new URL(s.src).origin;
      } catch { /* continue */ }
    }

    // Fall back to a sibling widget's api-host (handles Vite dev, where the SDK
    // is a local module import — no "next-embed" script tag — and a widget
    // without an explicit api-host would otherwise fetch the wrong origin).
    // Checks every match rather than just the first: a plain querySelector()
    // would return whichever matching tag comes first in the DOM regardless
    // of whether it actually has api-host set, and demo pages commonly put
    // <next-user-menu> (which never sets it) before the widget being shown.
    const siblings = document.querySelectorAll(
      "next-user-menu, next-add-to-calendar, next-full-calendar, next-profile, next-my-invoices, next-faith-formation, next-mass-intention-calendar, next-perpetual-adoration, next-journey-milestones-individual, next-journey-milestones-family, next-organization-directory, next-organization-detail, next-personnel-directory, next-space-availability",
    );
    for (const sibling of siblings) {
      if (sibling === this) continue;
      const host = sibling.getAttribute("api-host");
      if (host) return host;
    }

    return "";
  }

  /**
   * Fetch wrapper with automatic token injection and refresh on 401
   */
  protected async fetch(
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    await this.waitForTokenProvider();

    const token = await this.tokenProvider();

    if (!token) {
      throw new Error("Authentication token not available.");
    }

    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
    };

    const res = await fetch(`${this.apiHost}${path}`, {
      ...init,
      headers,
      credentials: "omit",
      mode: "cors",
    });

    // Handle token refresh on 401
    if (res.status === 401 && window.__nextTokenProvider?.refresh) {
      const newToken = await window.__nextTokenProvider.refresh();
      return fetch(`${this.apiHost}${path}`, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          Authorization: `Bearer ${newToken}`,
        },
        credentials: "omit",
        mode: "cors",
      });
    }

    return res;
  }

  /**
   * Inject CSS into Shadow DOM
   * Uses Constructable Stylesheets when available, fallback to <style> tag
   */
  protected injectStyles(css: string): void {
    if (supportsConstructableStylesheets()) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        this.baseStyleSheet = sheet;
        this.applyAdoptedStyleSheets();
        return;
      } catch {
        // fall through to <style> tag fallback below
      }
    }
    this.injectStyleTag(css);
  }

  private injectStyleTag(css: string): void {
    const style = document.createElement("style");
    style.textContent = css;
    this.root.appendChild(style);
  }

  private applyAdoptedStyleSheets(): void {
    this.root.adoptedStyleSheets = [this.baseStyleSheet, this.customStyleSheet].filter(
      (sheet): sheet is CSSStyleSheet => sheet !== null,
    );
  }

  /**
   * Load and apply an admin-supplied stylesheet — the `customcss` attribute
   * every next-gen widget shares, matching the classic MinistryPlatform
   * widgets' own attribute of the same name (same semantics: a URL to a CSS
   * file, applied inside this widget's own Shadow DOM). Applied after the
   * widget's own base styles, so equal-specificity rules in the supplied
   * file win the cascade. Re-running this (e.g. on an attribute change)
   * always replaces the same tracked stylesheet slot rather than stacking
   * duplicates, and a stale in-flight fetch is discarded if superseded by a
   * newer URL before it resolves.
   *
   * Fetched through our own /api/embed/customcss proxy rather than
   * directly: the CSS text has to be read into JS (to build a Constructable
   * Stylesheet), which needs CORS permission from the file's host — and an
   * admin's existing customcss file for the classic widgets typically lives
   * on their MinistryPlatform domain, which doesn't send CORS headers for
   * cross-origin fetches (only for the plain `<link>` tags the classic
   * widgets use, which don't need them). A server-to-server fetch has no
   * such restriction.
   */
  protected async applyCustomCss(url: string | null): Promise<void> {
    this.customCssUrl = url;

    if (this.customCssStyleTagEl) {
      this.customCssStyleTagEl.remove();
      this.customCssStyleTagEl = null;
    }

    if (!url) {
      this.customStyleSheet = null;
      this.applyAdoptedStyleSheets();
      return;
    }

    try {
      const proxyUrl = `${this.apiHost}/api/embed/customcss?url=${encodeURIComponent(url)}`;
      const cssText = await fetchCSSText(proxyUrl);
      if (this.customCssUrl !== url) return; // superseded by a newer call

      if (supportsConstructableStylesheets()) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        this.customStyleSheet = sheet;
        this.applyAdoptedStyleSheets();
      } else {
        const style = document.createElement("style");
        style.textContent = cssText;
        this.root.appendChild(style);
        this.customCssStyleTagEl = style;
      }
    } catch (err) {
      console.warn(`[next-embed] Failed to load customcss from "${url}":`, err);
    }
  }

  /**
   * Wait for token provider to be initialized (max 5 seconds)
   */
  private async waitForTokenProvider(): Promise<void> {
    if (window.__nextSDKReady) {
      await window.__nextSDKReady;
    }

    const maxWait = 5000;
    const interval = 100;
    const start = Date.now();

    while (!window.__nextTokenProvider) {
      if (Date.now() - start > maxWait) {
        throw new Error(
          "Token provider not initialized after 5 seconds.",
        );
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    this.tokenProvider = window.__nextTokenProvider.get;
  }

  /**
   * Emit custom event from widget
   */
  protected emit(eventName: string, detail?: unknown): void {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  abstract render(): void;
  abstract connectedCallback(): void;
}

declare global {
  interface Window {
    __nextTokenProvider?: {
      get: () => Promise<string>;
      refresh?: () => Promise<string>;
    };
    __nextSDKReady?: Promise<void>;
    __nextSDKReadyResolve?: () => void;
  }
}
