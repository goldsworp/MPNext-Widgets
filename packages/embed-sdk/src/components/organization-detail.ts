import { MPNextWidget } from "../shared/base-widget";
import { loadScript, injectExternalCSS } from "../shared/cdn-loader";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface MassScheduleEntry {
  Day_Of_Week: string;
  Day_Of_Week_Number: number;
  Time_Label: string;
  Event_Title: string;
}

interface OrganizationDetail {
  Congregation_ID: number;
  Name: string;
  Description: string | null;
  Location_Category_ID: number | null;
  Location_Category: string | null;
  Location_Group_ID: number | null;
  Location_Group: string | null;
  City: string | null;
  State: string | null;
  Postal_Code: string | null;
  Phone: string | null;
  Latitude: number | null;
  Longitude: number | null;
  Logo_URL: string | null;
  Giving_URL: string | null;
  Address_Line_1: string | null;
  Address_Line_2: string | null;
  Pastor_Name: string | null;
  Mass_Schedule: MassScheduleEntry[];
}

// ── Constants ──

const LEAFLET_VERSION = "1.9.4";
// jsdelivr, not unpkg — matches the CDN already used (and proven reliable in
// production) for FullCalendar elsewhere in this SDK.
const LEAFLET_CSS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_IMAGES_BASE = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/images`;

const TILE_LAYERS: Record<string, { url: string; attribution: string }> = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  street: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class OrganizationDetailWidget extends MPNextWidget {
  private loading = true;
  private error: string | null = null;
  private notFound = false;
  private organization: OrganizationDetail | null = null;

  // ── Config (attributes) ──
  private directoryPage = "/organization-directory";
  private backLabel = "← All Organizations";
  private idParam = "id";
  private massEventTypeId: number | null = null;
  private heroHeight = "260px";
  private heroHeightMobile = "160px";
  private heroOverlay = 0.35;
  private brandColor = "#004C97";
  private accentColor = "#F1BE48";
  private mapStyle: keyof typeof TILE_LAYERS = "light";
  private mapZoom = 14;
  private showPhone = true;
  private showDescription = true;
  private showGivingLink = true;
  private requireSignIn = false;

  private authRequired = false;
  private leafletLoaded = false;
  private mapLoadError: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapInstance: any = null;

  static get observedAttributes() {
    return [
      "directory-page",
      "back-label",
      "id-param",
      "mass-event-type-id",
      "hero-height",
      "hero-height-mobile",
      "hero-overlay",
      "brand-color",
      "accent-color",
      "map-style",
      "map-zoom",
      "show-phone",
      "show-description",
      "show-giving-link",
      "require-sign-in",
    ];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    this.readAttribute(name, next);
    if (this.loading) return;
    if (name === "id-param" || name === "mass-event-type-id" || name === "require-sign-in") {
      void this.loadOrganization();
    } else {
      this.render();
    }
  }

  private readAttribute(name: string, next: string | null): void {
    switch (name) {
      case "directory-page":
        this.directoryPage = next || "/organization-directory";
        break;
      case "back-label":
        this.backLabel = next || "← All Organizations";
        break;
      case "id-param":
        this.idParam = next || "id";
        break;
      case "mass-event-type-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.massEventTypeId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "hero-height":
        this.heroHeight = next || "260px";
        break;
      case "hero-height-mobile":
        this.heroHeightMobile = next || "160px";
        break;
      case "hero-overlay": {
        const parsed = next ? parseFloat(next) : NaN;
        this.heroOverlay = !isNaN(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.35;
        break;
      }
      case "brand-color":
        this.brandColor = next || "#004C97";
        break;
      case "accent-color":
        this.accentColor = next || "#F1BE48";
        break;
      case "map-style":
        this.mapStyle = next && next in TILE_LAYERS ? (next as keyof typeof TILE_LAYERS) : "light";
        break;
      case "map-zoom":
        this.mapZoom = next ? parseInt(next, 10) || 14 : 14;
        break;
      case "show-phone":
        this.showPhone = next !== "false";
        break;
      case "show-description":
        this.showDescription = next !== "false";
        break;
      case "show-giving-link":
        this.showGivingLink = next !== "false";
        break;
      case "require-sign-in":
        this.requireSignIn = next === "true";
        break;
    }
  }

  async connectedCallback() {
    for (const attr of OrganizationDetailWidget.observedAttributes) {
      this.readAttribute(attr, this.getAttribute(attr));
    }

    this.injectStyles(this.getStyles());
    this.render();
    await this.loadOrganization();
  }

  disconnectedCallback(): void {
    if (this.mapInstance) {
      try {
        this.mapInstance.remove();
      } catch {
        // ignore
      }
      this.mapInstance = null;
    }
  }

  // ── Data ──

  private getCongregationId(): number | null {
    const raw = new URLSearchParams(window.location.search).get(this.idParam);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  }

  private async loadOrganization(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.notFound = false;
    this.authRequired = false;
    this.render();

    const congregationId = this.getCongregationId();
    if (congregationId === null) {
      this.loading = false;
      this.notFound = true;
      this.render();
      return;
    }

    try {
      const params = new URLSearchParams();
      if (this.massEventTypeId) params.set("massEventTypeId", String(this.massEventTypeId));
      if (this.requireSignIn) params.set("requireSignIn", "true");

      const res = await this.fetch(`/api/embed/organization-directory/${congregationId}?${params}`);
      if (res.status === 401) {
        this.authRequired = true;
        this.loading = false;
        this.render();
        return;
      }
      if (res.status === 404) {
        this.notFound = true;
        this.loading = false;
        this.render();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      this.organization = await res.json();
      this.loading = false;
      this.render();
      this.emit("organizationDetailLoaded", { organization: this.organization });

      if (this.organization?.Latitude !== null && this.organization?.Longitude !== null) {
        await this.ensureMapLoaded();
        if (!this.mapLoadError) this.renderMap();
      }
    } catch (err) {
      this.error = "Error loading organization: " + (err instanceof Error ? err.message : String(err));
      this.loading = false;
      this.render();
      this.emit("organizationDetailError", { error: this.error });
    }
  }

  // ── Map ──

  private async ensureMapLoaded(): Promise<void> {
    if (this.leafletLoaded || this.mapLoadError) return;
    try {
      await injectExternalCSS(this.root, LEAFLET_CSS_URL);
      await loadScript(LEAFLET_JS_URL);
      // See organization-directory.ts's ensureMapLoaded for why this is
      // needed: Leaflet's default marker icon path auto-detection breaks
      // once its script is one of many injected into a host page's <head>,
      // so the marker icon images 404 unless pointed at the CDN explicitly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: `${LEAFLET_IMAGES_BASE}/marker-icon-2x.png`,
        iconUrl: `${LEAFLET_IMAGES_BASE}/marker-icon.png`,
        shadowUrl: `${LEAFLET_IMAGES_BASE}/marker-shadow.png`,
      });
      this.leafletLoaded = true;
      this.render();
    } catch (err) {
      this.mapLoadError = "Map failed to load. " + (err instanceof Error ? err.message : String(err));
      this.render();
    }
  }

  private renderMap(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    const org = this.organization;
    if (!L || !org || org.Latitude === null || org.Longitude === null) return;

    const mount = this.root.querySelector<HTMLElement>("#odd-map");
    if (!mount) return;

    if (this.mapInstance) {
      try {
        this.mapInstance.remove();
      } catch {
        // ignore
      }
    }

    this.mapInstance = L.map(mount).setView([org.Latitude, org.Longitude], this.mapZoom);
    const layer = TILE_LAYERS[this.mapStyle];
    L.tileLayer(layer.url, { attribution: layer.attribution, maxZoom: 19 }).addTo(this.mapInstance);
    L.marker([org.Latitude, org.Longitude]).addTo(this.mapInstance).bindPopup(escapeHtml(org.Name));

    requestAnimationFrame(() => this.mapInstance.invalidateSize());
  }

  // ── Rendering ──

  private renderMassSchedule(org: OrganizationDetail): string {
    if (org.Mass_Schedule.length === 0) {
      return `
        <div class="odd-section">
          <h3 class="odd-section-title">Mass Schedule</h3>
          <p class="odd-empty">No Mass times are currently published for ${escapeHtml(org.Name)}.</p>
        </div>
      `;
    }
    return `
      <div class="odd-section">
        <h3 class="odd-section-title">Mass Schedule</h3>
        <ul class="odd-mass-list">
          ${org.Mass_Schedule.map(
            (entry) => `<li><span class="odd-mass-day">${escapeHtml(entry.Day_Of_Week)}</span><span class="odd-mass-time">${escapeHtml(entry.Time_Label)}</span></li>`
          ).join("")}
        </ul>
      </div>
    `;
  }

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="odd-state odd-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }
    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="odd-wrap">
          <div class="odd-login-gate">
            <div class="odd-login-icon">🔒</div>
            <div class="odd-login-title">Please sign in to view this page</div>
            <div class="odd-login-sub">Sign in above, then try again.</div>
          </div>
        </div>
      `;
      return;
    }
    if (this.loading) {
      this.root.innerHTML = `<div class="odd-state"><div class="odd-spinner"></div><p>Loading…</p></div>`;
      return;
    }
    if (this.notFound || !this.organization) {
      this.root.innerHTML = `
        <div class="odd-state">
          <p>We couldn't find that organization.</p>
          <a class="odd-back-link" href="${escapeHtml(this.directoryPage)}">${escapeHtml(this.backLabel)}</a>
        </div>
      `;
      return;
    }

    const org = this.organization;
    const cityState = [org.City, org.State].filter(Boolean).join(", ");
    const fullAddress = [org.Address_Line_1, org.Address_Line_2, cityState, org.Postal_Code].filter(Boolean).join(", ");
    const hasCoords = org.Latitude !== null && org.Longitude !== null;
    const directionsHref = hasCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${org.Latitude},${org.Longitude}`
      : null;

    const heroStyle = org.Logo_URL
      ? `background-image: linear-gradient(rgba(0,0,0,${this.heroOverlay}), rgba(0,0,0,${this.heroOverlay})), url('${org.Logo_URL}'); background-size: cover; background-position: center;`
      : `background: ${this.brandColor};`;

    this.root.innerHTML = `
      <div class="odd-wrap">
        <a class="odd-back-link" href="${escapeHtml(this.directoryPage)}">${escapeHtml(this.backLabel)}</a>

        <div class="odd-hero" style="${heroStyle}">
          ${!org.Logo_URL ? `<div class="odd-monogram">${escapeHtml(org.Name.charAt(0).toUpperCase())}</div>` : ""}
          <div class="odd-hero-text">
            <h1 class="odd-name">${escapeHtml(org.Name)}</h1>
            ${org.Location_Category ? `<div class="odd-category">${escapeHtml(org.Location_Category)}</div>` : ""}
          </div>
        </div>

        <div class="odd-body">
          ${this.showDescription && org.Description ? `<p class="odd-description">${escapeHtml(org.Description)}</p>` : ""}

          <div class="odd-info-grid">
            <div class="odd-section">
              <h3 class="odd-section-title">Contact</h3>
              ${fullAddress ? `<p class="odd-address">${escapeHtml(fullAddress)}</p>` : ""}
              ${this.showPhone && org.Phone ? `<p class="odd-phone">${escapeHtml(org.Phone)}</p>` : ""}
              ${org.Pastor_Name ? `<p class="odd-pastor">Pastor: ${escapeHtml(org.Pastor_Name)}</p>` : ""}
              ${directionsHref ? `<a class="odd-directions" href="${directionsHref}" target="_blank" rel="noopener">Get Directions →</a>` : ""}
              ${this.showGivingLink && org.Giving_URL ? `<a class="odd-giving" href="${escapeHtml(org.Giving_URL)}" target="_blank" rel="noopener">Give →</a>` : ""}
            </div>

            ${this.renderMassSchedule(org)}
          </div>

          ${hasCoords ? `<div class="odd-map-wrap"><div id="odd-map" class="odd-map"></div>${this.mapLoadError ? `<div class="odd-map-loading odd-map-error">${escapeHtml(this.mapLoadError)}</div>` : !this.leafletLoaded ? `<div class="odd-map-loading">Loading map…</div>` : ""}</div>` : ""}
        </div>
      </div>
    `;
  }

  // ── Styles ──

  private getStyles(): string {
    return `
      :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; color: #2D2926; }

      .odd-state { text-align: center; padding: 32px 16px; color: #474747; }
      .odd-state-error { color: #d32f2f; }
      .odd-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: ${this.brandColor}; border-radius: 50%;
        animation: odd-spin 0.8s linear infinite;
      }
      @keyframes odd-spin { to { transform: rotate(360deg); } }

      .odd-wrap {
        background: #fff; border: 1px solid #e3ebf3; border-radius: 14px; overflow: hidden;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08);
      }

      .odd-login-gate { text-align: center; padding: 40px 20px; }
      .odd-login-icon { font-size: 2.4em; line-height: 1; margin-bottom: 10px; }
      .odd-login-title { font-size: 1.15em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .odd-login-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .odd-back-link {
        display: inline-block; margin: 16px 0 0 20px; color: ${this.brandColor}; text-decoration: none;
        font-size: 0.9em; font-weight: 600;
      }
      .odd-back-link:hover { text-decoration: underline; }

      .odd-hero {
        position: relative; height: ${this.heroHeight}; display: flex; align-items: flex-end;
        margin-top: 12px; color: #fff;
      }
      .odd-monogram {
        position: absolute; top: 50%; left: 24px; transform: translateY(-50%);
        width: 72px; height: 72px; border-radius: 12px; background: rgba(255,255,255,0.2);
        display: flex; align-items: center; justify-content: center; font-size: 2em; font-weight: 700;
      }
      .odd-hero-text { padding: 20px 24px; }
      .odd-name { margin: 0 0 4px; font-size: 1.7em; }
      .odd-category { font-size: 0.85em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.9; }

      .odd-body { padding: 22px 24px 26px; }
      .odd-description { color: #667080; line-height: 1.6; margin: 0 0 20px; }

      .odd-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-bottom: 20px; }
      .odd-section-title {
        font-size: 0.85em; font-weight: 700; color: ${this.brandColor}; text-transform: uppercase;
        letter-spacing: 0.04em; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid ${this.accentColor};
      }
      .odd-address, .odd-phone, .odd-pastor { margin: 0 0 6px; color: #444; font-size: 0.95em; }
      .odd-directions, .odd-giving {
        display: inline-block; margin: 8px 12px 0 0; color: ${this.brandColor}; font-weight: 600; text-decoration: none; font-size: 0.9em;
      }
      .odd-directions:hover, .odd-giving:hover { text-decoration: underline; }

      .odd-empty { color: #6b7a88; font-size: 0.9em; margin: 0; }
      .odd-mass-list { list-style: none; margin: 0; padding: 0; }
      .odd-mass-list li {
        display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f3f6; font-size: 0.92em;
      }
      .odd-mass-list li:last-child { border-bottom: none; }
      .odd-mass-day { font-weight: 600; color: #2c3e50; }
      .odd-mass-time { color: #667080; }

      .odd-map-wrap { position: relative; }
      .odd-map { height: 260px; border-radius: 10px; overflow: hidden; z-index: 0; }
      .odd-map-loading {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: #f4f8fb; color: #6b7a88; border-radius: 10px; text-align: center; padding: 16px; box-sizing: border-box;
      }
      .odd-map-error { color: #c62828; background: #fef3f2; }

      @media (max-width: 640px) {
        .odd-hero { height: ${this.heroHeightMobile}; }
        .odd-body { padding: 16px; }
      }
    `;
  }
}

customElements.define("next-organization-detail", OrganizationDetailWidget);
