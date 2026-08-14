import { MPNextWidget } from "../shared/base-widget";
import { loadScript, injectExternalCSS } from "../shared/cdn-loader";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface OrganizationSummary {
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
}

// ── Constants ──

const LEAFLET_VERSION = "1.9.4";
// jsdelivr, not unpkg — matches the CDN already used (and proven reliable in
// production) for FullCalendar elsewhere in this SDK.
const LEAFLET_CSS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS_URL = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

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

const COMMON_LEADING_TITLES = ["st.", "st", "saint", "sts.", "sts", "the"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fillTemplate(tpl: string, values: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

// Strips a recognized leading title/article for alphabetical filing (e.g.
// "St. Mary" files under M) — display text is never altered, only the sort
// key used for grouping/ordering.
function sortKeyFor(name: string): string {
  let key = name.trim().toLowerCase();
  for (const title of COMMON_LEADING_TITLES) {
    if (key.startsWith(title + " ")) {
      key = key.slice(title.length + 1);
      break;
    }
  }
  return key;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class OrganizationDirectoryWidget extends MPNextWidget {
  private loading = true;
  private error: string | null = null;

  // ── Config (attributes) ──
  private locationCategoryIds: string | undefined;
  private pinnedCategoryIds = new Set<number>();
  private browseGroupTypeId: number | null = null;
  private congregationIds: string | undefined;
  private pageTitle = "Organization Directory";
  private pageIntro = "";
  private nounSingular = "Organization";
  private nounPlural = "Organizations";
  private groupNounPlural = "Groups";
  private detailPageUrlTemplate = "/organization-detail?id={congregationId}";
  private brandColor = "#004C97";
  private accentColor = "#F1BE48";
  private mapStyle: keyof typeof TILE_LAYERS = "light";
  private mapCenter: { lat: number; lng: number } | null = null;
  private mapZoom = 9;
  private ignoreLeadingTitles = true;
  private radiusOptions: number[] = [5, 10, 25, 50];
  private defaultRadius = 25;
  private units: "mi" | "km" = "mi";
  private geocodeCountry = "us";
  private showLogos = true;
  private logoFit: "cover" | "contain" = "cover";
  private showPhone = true;
  private showDescription = true;
  private pageSize = 24;
  private compactThreshold = 60;
  private clusterThreshold = 40;
  private requireSignIn = false;

  // ── State ──
  private allOrganizations: OrganizationSummary[] = [];
  private searchTerm = "";
  private browseMode: "alphabetical" | "group" = "alphabetical";
  private visibleCount = 0;
  private originPoint: { lat: number; lng: number } | null = null;
  private radiusMiles: number | null = null;
  private geocoding = false;
  private geocodeError: string | null = null;
  private authRequired = false;
  private leafletLoaded = false;
  private mapLoadError: string | null = null;
  private geolocating = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapInstance: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapMarkers: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private singleMarkersByOrgId: Map<number, any> = new Map();

  static get observedAttributes() {
    return [
      "location-category-ids",
      "pinned-category-ids",
      "browse-group-type-id",
      "congregation-ids",
      "page-title",
      "page-intro",
      "noun-singular",
      "noun-plural",
      "group-noun-plural",
      "detail-page-url-template",
      "brand-color",
      "accent-color",
      "map-style",
      "map-center",
      "map-zoom",
      "ignore-leading-titles",
      "radius-options",
      "default-radius",
      "units",
      "geocode-country",
      "show-logos",
      "logo-fit",
      "show-phone",
      "show-description",
      "page-size",
      "compact-threshold",
      "cluster-threshold",
      "require-sign-in",
    ];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    this.readAttribute(name, next);
    if (this.loading) return;
    if (name === "location-category-ids" || name === "congregation-ids" || name === "require-sign-in") {
      void this.loadOrganizations();
    } else {
      this.render();
    }
  }

  private readAttribute(name: string, next: string | null): void {
    switch (name) {
      case "location-category-ids":
        this.locationCategoryIds = next || undefined;
        break;
      case "pinned-category-ids":
        this.pinnedCategoryIds = new Set(
          (next || "")
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => !isNaN(n))
        );
        break;
      case "browse-group-type-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.browseGroupTypeId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "congregation-ids":
        this.congregationIds = next || undefined;
        break;
      case "page-title":
        this.pageTitle = next || "Organization Directory";
        break;
      case "page-intro":
        this.pageIntro = next || "";
        break;
      case "noun-singular":
        this.nounSingular = next || "Organization";
        break;
      case "noun-plural":
        this.nounPlural = next || "Organizations";
        break;
      case "group-noun-plural":
        this.groupNounPlural = next || "Groups";
        break;
      case "detail-page-url-template":
        this.detailPageUrlTemplate = next || "/organization-detail?id={congregationId}";
        break;
      case "brand-color":
        this.brandColor = next || "#004C97";
        break;
      case "accent-color":
        this.accentColor = next || "#F1BE48";
        break;
      case "map-style":
        this.mapStyle = next && next in TILE_LAYERS ? (next as keyof typeof TILE_LAYERS) : "light";
        break;
      case "map-center": {
        const parts = (next || "").split(",").map((s) => parseFloat(s.trim()));
        this.mapCenter = parts.length === 2 && parts.every((n) => !isNaN(n)) ? { lat: parts[0], lng: parts[1] } : null;
        break;
      }
      case "map-zoom":
        this.mapZoom = next ? parseInt(next, 10) || 9 : 9;
        break;
      case "ignore-leading-titles":
        this.ignoreLeadingTitles = next !== "false";
        break;
      case "radius-options": {
        const nums = (next || "")
          .split(",")
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !isNaN(n) && n > 0);
        this.radiusOptions = nums.length > 0 ? nums : [5, 10, 25, 50];
        break;
      }
      case "default-radius":
        this.defaultRadius = next ? parseFloat(next) || 25 : 25;
        break;
      case "units":
        this.units = next === "km" ? "km" : "mi";
        break;
      case "geocode-country":
        this.geocodeCountry = next || "us";
        break;
      case "show-logos":
        this.showLogos = next !== "false";
        break;
      case "logo-fit":
        this.logoFit = next === "contain" ? "contain" : "cover";
        break;
      case "show-phone":
        this.showPhone = next !== "false";
        break;
      case "show-description":
        this.showDescription = next !== "false";
        break;
      case "page-size":
        this.pageSize = next ? parseInt(next, 10) || 24 : 24;
        break;
      case "compact-threshold":
        this.compactThreshold = next ? parseInt(next, 10) || 60 : 60;
        break;
      case "cluster-threshold":
        this.clusterThreshold = next ? parseInt(next, 10) || 40 : 40;
        break;
      case "require-sign-in":
        this.requireSignIn = next === "true";
        break;
    }
  }

  async connectedCallback() {
    for (const attr of OrganizationDirectoryWidget.observedAttributes) {
      this.readAttribute(attr, this.getAttribute(attr));
    }
    this.radiusMiles = this.units === "km" ? this.defaultRadius / 1.60934 : this.defaultRadius;
    this.visibleCount = this.pageSize;

    this.injectStyles(this.getStyles());
    this.render();
    await this.loadOrganizations();
  }

  // ── Data ──

  private async loadOrganizations(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.authRequired = false;
    this.render();

    try {
      const params = new URLSearchParams();
      if (this.locationCategoryIds) params.set("locationCategoryIds", this.locationCategoryIds);
      if (this.congregationIds) params.set("congregationIds", this.congregationIds);
      if (this.requireSignIn) params.set("requireSignIn", "true");

      const res = await this.fetch(`/api/embed/organization-directory?${params}`);
      if (res.status === 401) {
        this.authRequired = true;
        this.loading = false;
        this.render();
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: { organizations: OrganizationSummary[] } = await res.json();
      this.allOrganizations = data.organizations;
      if (this.allOrganizations.some((o) => o.Location_Group_ID) && this.browseGroupTypeId) {
        this.browseMode = "alphabetical";
      }
      this.loading = false;
      this.render();
    } catch (err) {
      this.error = "Error loading directory: " + (err instanceof Error ? err.message : String(err));
      this.loading = false;
      this.render();
      this.emit("organizationDirectoryError", { error: this.error });
    }
  }

  // ── Distance search ──

  private async handleDistanceSearch(zip: string, radius: number): Promise<void> {
    this.geocodeError = null;
    this.geocoding = true;
    this.render();

    try {
      const res = await fetch(`https://api.zippopotam.us/${encodeURIComponent(this.geocodeCountry)}/${encodeURIComponent(zip)}`);
      if (!res.ok) throw new Error("That doesn't look like a valid postal code.");
      const data = await res.json();
      const place = data.places?.[0];
      if (!place) throw new Error("Couldn't locate that postal code.");
      this.originPoint = { lat: parseFloat(place.latitude), lng: parseFloat(place.longitude) };
      this.radiusMiles = this.units === "km" ? radius / 1.60934 : radius;
    } catch (err) {
      this.geocodeError = err instanceof Error ? err.message : String(err);
      this.originPoint = null;
    } finally {
      this.geocoding = false;
      this.render();
    }
  }

  private clearDistanceSearch(): void {
    this.originPoint = null;
    this.geocodeError = null;
    this.render();
  }

  private handleUseMyLocation(radius: number): void {
    this.geocodeError = null;

    if (!navigator.geolocation) {
      this.geocodeError = "Your browser doesn't support finding your location. Try entering a ZIP code instead.";
      this.render();
      return;
    }

    this.geolocating = true;
    this.render();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.originPoint = { lat: position.coords.latitude, lng: position.coords.longitude };
        this.radiusMiles = this.units === "km" ? radius / 1.60934 : radius;
        this.geolocating = false;
        this.render();
      },
      (error) => {
        this.geocodeError =
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. Try entering a ZIP code instead."
            : "Couldn't determine your location. Try entering a ZIP code instead.";
        this.geolocating = false;
        this.render();
      },
      { timeout: 10000 }
    );
  }

  // ── Filtering / grouping ──

  private matchesSearch(org: OrganizationSummary): boolean {
    if (!this.searchTerm) return true;
    const term = this.searchTerm.toLowerCase();
    return org.Name.toLowerCase().includes(term) || (org.City || "").toLowerCase().includes(term);
  }

  private distanceFor(org: OrganizationSummary): number | null {
    if (!this.originPoint || org.Latitude === null || org.Longitude === null) return null;
    return haversineMiles(this.originPoint.lat, this.originPoint.lng, org.Latitude, org.Longitude);
  }

  private isExemptFromDistanceFilter(org: OrganizationSummary): boolean {
    return org.Location_Category_ID !== null && this.pinnedCategoryIds.has(org.Location_Category_ID);
  }

  private filteredOrganizations(): OrganizationSummary[] {
    let orgs = this.allOrganizations.filter((o) => this.matchesSearch(o));

    if (this.originPoint && this.radiusMiles !== null) {
      orgs = orgs.filter((o) => {
        if (this.isExemptFromDistanceFilter(o)) return true;
        const d = this.distanceFor(o);
        return d !== null && d <= this.radiusMiles!;
      });
      orgs.sort((a, b) => {
        const da = this.distanceFor(a);
        const db = this.distanceFor(b);
        if (da === null && db === null) return a.Name.localeCompare(b.Name);
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    } else {
      orgs.sort((a, b) => sortKeyFor(a.Name).localeCompare(sortKeyFor(b.Name)));
    }

    return orgs;
  }

  // ── Rendering ──

  private formatDistance(miles: number): string {
    const value = this.units === "km" ? miles * 1.60934 : miles;
    return `${value.toFixed(1)} ${this.units}`;
  }

  private directionsHrefFor(org: OrganizationSummary): string | null {
    if (org.Latitude === null || org.Longitude === null) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${org.Latitude},${org.Longitude}`;
  }

  private orgCardHtml(org: OrganizationSummary, compact: boolean): string {
    const distance = this.distanceFor(org);
    const href = fillTemplate(this.detailPageUrlTemplate, { congregationId: org.Congregation_ID });
    const cityState = [org.City, org.State].filter(Boolean).join(", ");
    const logo =
      this.showLogos && org.Logo_URL
        ? `<img class="od-logo" style="object-fit:${this.logoFit}" src="${escapeHtml(org.Logo_URL)}" alt="">`
        : `<div class="od-logo od-logo-monogram">${escapeHtml(org.Name.charAt(0).toUpperCase())}</div>`;

    if (compact) {
      return `
        <a class="od-row" href="${escapeHtml(href)}">
          ${logo}
          <div class="od-row-info">
            <div class="od-row-name">${escapeHtml(org.Name)}</div>
            <div class="od-row-meta">${escapeHtml(cityState)}${org.Location_Category ? " · " + escapeHtml(org.Location_Category) : ""}</div>
          </div>
          ${distance !== null ? `<div class="od-row-distance">${this.formatDistance(distance)}</div>` : ""}
        </a>
      `;
    }

    const directionsHref = this.directionsHrefFor(org);
    const hasCoords = org.Latitude !== null && org.Longitude !== null;

    return `
      <div class="od-card">
        ${logo}
        <div class="od-card-body">
          <a class="od-card-name" href="${escapeHtml(href)}">${escapeHtml(org.Name)}</a>
          ${org.Location_Category ? `<div class="od-card-category">${escapeHtml(org.Location_Category)}</div>` : ""}
          ${this.showDescription && org.Description ? `<div class="od-card-desc">${escapeHtml(org.Description)}</div>` : ""}
          <div class="od-card-meta">
            ${cityState ? `<span>${escapeHtml(cityState)}</span>` : ""}
            ${this.showPhone && org.Phone ? `<span>${escapeHtml(org.Phone)}</span>` : ""}
            ${distance !== null ? `<span class="od-distance-chip">${this.formatDistance(distance)} away</span>` : ""}
          </div>
          <div class="od-card-actions">
            ${hasCoords ? `<button type="button" class="od-action-btn" data-action="map" data-congregation-id="${org.Congregation_ID}">Map</button>` : ""}
            ${directionsHref ? `<a class="od-action-btn" href="${escapeHtml(directionsHref)}" target="_blank" rel="noopener">Directions</a>` : ""}
            <a class="od-action-btn od-action-btn-primary" href="${escapeHtml(href)}">Details</a>
          </div>
        </div>
      </div>
    `;
  }

  private renderListBody(orgs: OrganizationSummary[]): string {
    if (orgs.length === 0) {
      return `<div class="od-empty">No ${this.nounPlural.toLowerCase()} match your search.</div>`;
    }

    const compact = this.allOrganizations.length > this.compactThreshold;
    const visible = orgs.slice(0, this.visibleCount);
    const hasOriginOrder = this.originPoint !== null;

    let groupsHtml: string;
    if (hasOriginOrder) {
      // Distance order takes priority over alphabetical/deanery grouping.
      groupsHtml = `<div class="od-group-items ${compact ? "od-rows" : "od-cards"}">${visible
        .map((o) => this.orgCardHtml(o, compact))
        .join("")}</div>`;
    } else if (this.browseMode === "group" && this.browseGroupTypeId) {
      const byGroup = new Map<string, OrganizationSummary[]>();
      for (const o of visible) {
        const key = o.Location_Group || "Other";
        const list = byGroup.get(key);
        if (list) list.push(o);
        else byGroup.set(key, [o]);
      }
      const sortedGroups = [...byGroup.keys()].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
      groupsHtml = sortedGroups
        .map(
          (group) => `
            <div class="od-group">
              <div class="od-group-heading">${escapeHtml(group)}</div>
              <div class="od-group-items ${compact ? "od-rows" : "od-cards"}">
                ${byGroup.get(group)!.map((o) => this.orgCardHtml(o, compact)).join("")}
              </div>
            </div>
          `
        )
        .join("");
    } else {
      const byLetter = new Map<string, OrganizationSummary[]>();
      for (const o of visible) {
        const key = sortKeyFor(o.Name).charAt(0).toUpperCase() || "#";
        const list = byLetter.get(key);
        if (list) list.push(o);
        else byLetter.set(key, [o]);
      }
      groupsHtml = [...byLetter.keys()]
        .sort()
        .map(
          (letter) => `
            <div class="od-group">
              <div class="od-group-heading">${letter}</div>
              <div class="od-group-items ${compact ? "od-rows" : "od-cards"}">
                ${byLetter.get(letter)!.map((o) => this.orgCardHtml(o, compact)).join("")}
              </div>
            </div>
          `
        )
        .join("");
    }

    const hasMore = orgs.length > this.visibleCount;
    return `
      ${groupsHtml}
      ${hasMore ? `<button type="button" class="od-load-more" id="od-load-more">Show more ${this.nounPlural.toLowerCase()} (${orgs.length - this.visibleCount} remaining)</button>` : ""}
    `;
  }

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="od-state od-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }
    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="od-card-wrap">
          <div class="od-login-gate">
            <div class="od-login-icon">🔒</div>
            <div class="od-login-title">Please sign in to view the ${escapeHtml(this.nounPlural.toLowerCase())} directory</div>
            <div class="od-login-sub">Sign in above, then try again.</div>
          </div>
        </div>
      `;
      return;
    }
    if (this.loading) {
      this.root.innerHTML = `<div class="od-state"><div class="od-spinner"></div><p>Loading ${this.nounPlural.toLowerCase()}…</p></div>`;
      return;
    }

    const orgs = this.filteredOrganizations();

    this.root.innerHTML = `
      <div class="od-card-wrap">
        <div class="od-header">
          <h2 class="od-title">${escapeHtml(this.pageTitle)}</h2>
          ${this.pageIntro ? `<p class="od-intro">${escapeHtml(this.pageIntro)}</p>` : ""}
        </div>

        <div class="od-controls">
          <input type="search" id="od-search" class="od-search" placeholder="Search by name or city…" value="${escapeHtml(this.searchTerm)}">

          <div class="od-distance-search">
            <input type="text" id="od-zip" class="od-zip-input" placeholder="ZIP / postal code" inputmode="numeric">
            <select id="od-radius">
              ${this.radiusOptions.map((r) => `<option value="${r}" ${r === this.defaultRadius ? "selected" : ""}>${r} ${this.units}</option>`).join("")}
            </select>
            <button type="button" class="od-btn" id="od-search-distance">${this.geocoding ? "Searching…" : "Near Me"}</button>
            <button type="button" class="od-btn od-btn-secondary" id="od-use-my-location">${this.geolocating ? "Locating…" : "Use my location"}</button>
            ${this.originPoint ? `<button type="button" class="od-btn od-btn-clear" id="od-clear-distance">Clear</button>` : ""}
          </div>

          ${
            this.browseGroupTypeId
              ? `
            <div class="od-toggle-group">
              <button type="button" class="od-toggle ${this.browseMode === "alphabetical" ? "active" : ""}" data-browse="alphabetical">A–Z</button>
              <button type="button" class="od-toggle ${this.browseMode === "group" ? "active" : ""}" data-browse="group">By ${escapeHtml(this.groupNounPlural)}</button>
            </div>
          `
              : ""
          }
        </div>

        ${this.geocodeError ? `<div class="od-error-msg">${escapeHtml(this.geocodeError)}</div>` : ""}

        <div class="od-count">${orgs.length} ${orgs.length === 1 ? this.nounSingular.toLowerCase() : this.nounPlural.toLowerCase()}</div>

        <div class="od-layout">
          <div class="od-list">${this.renderListBody(orgs)}</div>
          <div class="od-map-panel">
            <div class="od-map-wrap">
              <div id="od-map" class="od-map"></div>
              ${this.mapLoadError ? `<div class="od-map-loading od-map-error">${escapeHtml(this.mapLoadError)}</div>` : !this.leafletLoaded ? `<div class="od-map-loading">Loading map…</div>` : ""}
            </div>
            ${!this.mapLoadError ? `<p class="od-map-hint">Click a pin for its address and directions, or use a card's "Map" button to locate it here.</p>` : ""}
          </div>
        </div>
      </div>
    `;

    this.attachControlListeners();
    void this.ensureMapLoaded().then(() => {
      if (!this.mapLoadError) this.renderMap(orgs);
    });
  }

  private attachControlListeners(): void {
    const searchInput = this.root.querySelector<HTMLInputElement>("#od-search");
    searchInput?.addEventListener("input", () => {
      this.searchTerm = searchInput.value;
      this.visibleCount = this.pageSize;
      this.render();
      this.root.querySelector<HTMLInputElement>("#od-search")?.focus();
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-browse]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.browseMode = btn.dataset.browse as "alphabetical" | "group";
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-action='map']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const congregationId = parseInt(btn.dataset.congregationId || "", 10);
        if (!isNaN(congregationId)) this.panToOrg(congregationId);
      });
    });

    this.root.querySelector("#od-load-more")?.addEventListener("click", () => {
      this.visibleCount += this.pageSize;
      this.render();
    });

    this.root.querySelector("#od-clear-distance")?.addEventListener("click", () => this.clearDistanceSearch());

    const zipInput = this.root.querySelector<HTMLInputElement>("#od-zip");
    const radiusSelect = this.root.querySelector<HTMLSelectElement>("#od-radius");
    const searchBtn = this.root.querySelector<HTMLButtonElement>("#od-search-distance");
    const triggerDistanceSearch = () => {
      const zip = zipInput?.value.trim();
      const radius = parseFloat(radiusSelect?.value || String(this.defaultRadius));
      if (zip) void this.handleDistanceSearch(zip, radius);
    };
    searchBtn?.addEventListener("click", triggerDistanceSearch);
    zipInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") triggerDistanceSearch();
    });

    this.root.querySelector("#od-use-my-location")?.addEventListener("click", () => {
      const radius = parseFloat(radiusSelect?.value || String(this.defaultRadius));
      this.handleUseMyLocation(radius);
    });
  }

  // ── Map ──

  private async ensureMapLoaded(): Promise<void> {
    if (this.leafletLoaded || this.mapLoadError) return;
    try {
      await injectExternalCSS(this.root, LEAFLET_CSS_URL);
      await loadScript(LEAFLET_JS_URL);
      this.leafletLoaded = true;
      this.render();
    } catch (err) {
      this.mapLoadError = "Map failed to load. " + (err instanceof Error ? err.message : String(err));
      this.render();
    }
  }

  private clusterPins(orgs: OrganizationSummary[]): { lat: number; lng: number; orgs: OrganizationSummary[] }[] {
    const withCoords = orgs.filter((o) => o.Latitude !== null && o.Longitude !== null);
    if (withCoords.length <= this.clusterThreshold) {
      return withCoords.map((o) => ({ lat: o.Latitude!, lng: o.Longitude!, orgs: [o] }));
    }
    // Simple grid-based clustering: round to ~1.1km cells and merge.
    const cellSize = 0.01;
    const cells = new Map<string, { lat: number; lng: number; orgs: OrganizationSummary[] }>();
    for (const o of withCoords) {
      const key = `${Math.round(o.Latitude! / cellSize)}:${Math.round(o.Longitude! / cellSize)}`;
      const cell = cells.get(key);
      if (cell) {
        cell.orgs.push(o);
      } else {
        cells.set(key, { lat: o.Latitude!, lng: o.Longitude!, orgs: [o] });
      }
    }
    return [...cells.values()];
  }

  private pinPopupHtml(org: OrganizationSummary): string {
    const cityStateZip = [[org.City, org.State].filter(Boolean).join(", "), org.Postal_Code].filter(Boolean).join(" ");
    const directionsHref = this.directionsHrefFor(org);
    return `
      <div class="od-pin-popup">
        <strong>${escapeHtml(org.Name)}</strong>
        ${cityStateZip ? `<div>${escapeHtml(cityStateZip)}</div>` : ""}
        ${org.Phone ? `<div><a href="tel:${escapeHtml(org.Phone.replace(/[^\d+]/g, ""))}">${escapeHtml(org.Phone)}</a></div>` : ""}
        ${directionsHref ? `<a href="${escapeHtml(directionsHref)}" target="_blank" rel="noopener">Get directions →</a>` : ""}
      </div>
    `;
  }

  /** Pans the map to a single organization's marker and opens its popup — used by each card's "Map" button. */
  private panToOrg(congregationId: number): void {
    if (!this.mapInstance) return;
    const marker = this.singleMarkersByOrgId.get(congregationId);
    if (marker) {
      this.mapInstance.setView(marker.getLatLng(), Math.max(this.mapInstance.getZoom(), 14));
      marker.openPopup();
      return;
    }
    // Bucketed into a cluster — no marker of its own to pop open, so just
    // center on the organization's coordinates instead.
    const org = this.allOrganizations.find((o) => o.Congregation_ID === congregationId);
    if (org && org.Latitude !== null && org.Longitude !== null) {
      this.mapInstance.setView([org.Latitude, org.Longitude], Math.max(this.mapInstance.getZoom(), 14));
    }
  }

  private renderMap(orgs: OrganizationSummary[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L) return;

    const mount = this.root.querySelector<HTMLElement>("#od-map");
    if (!mount) return;

    // The map's mount node is a fresh DOM element on every render() call
    // (the whole shadow root is rebuilt each time now that the map is
    // always visible, not just on toggle) — reusing a prior Leaflet
    // instance here would leave it bound to a now-detached node and the
    // new #od-map div would stay blank, so it's destroyed and recreated.
    if (this.mapInstance) {
      try {
        this.mapInstance.remove();
      } catch {
        // ignore
      }
    }
    this.mapMarkers = [];
    this.singleMarkersByOrgId = new Map();

    this.mapInstance = L.map(mount);
    const layer = TILE_LAYERS[this.mapStyle];
    L.tileLayer(layer.url, { attribution: layer.attribution, maxZoom: 19 }).addTo(this.mapInstance);

    const clusters = this.clusterPins(orgs);
    for (const cluster of clusters) {
      const marker = L.marker([cluster.lat, cluster.lng]).addTo(this.mapInstance);
      if (cluster.orgs.length === 1) {
        const o = cluster.orgs[0];
        marker.bindPopup(this.pinPopupHtml(o));
        this.singleMarkersByOrgId.set(o.Congregation_ID, marker);
      } else {
        marker.bindPopup(
          `<strong>${cluster.orgs.length} ${escapeHtml(this.nounPlural)}</strong><br>${cluster.orgs.map((o) => escapeHtml(o.Name)).join("<br>")}`
        );
      }
      this.mapMarkers.push(marker);
    }

    if (this.originPoint) {
      this.mapInstance.setView([this.originPoint.lat, this.originPoint.lng], this.mapZoom);
    } else if (clusters.length > 0) {
      const bounds = L.latLngBounds(clusters.map((c) => [c.lat, c.lng]));
      this.mapInstance.fitBounds(bounds, { padding: [24, 24] });
    } else if (this.mapCenter) {
      this.mapInstance.setView([this.mapCenter.lat, this.mapCenter.lng], this.mapZoom);
    } else {
      this.mapInstance.setView([39.8283, -98.5795], 4); // continental US fallback
    }

    requestAnimationFrame(() => this.mapInstance?.invalidateSize());
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

  // ── Styles ──

  private getStyles(): string {
    return `
      :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; color: #2D2926; }

      .od-state { text-align: center; padding: 32px 16px; color: #474747; }
      .od-state-error { color: #d32f2f; }
      .od-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: ${this.brandColor}; border-radius: 50%;
        animation: od-spin 0.8s linear infinite;
      }
      @keyframes od-spin { to { transform: rotate(360deg); } }

      .od-card-wrap {
        background: #fff; border: 1px solid #e3ebf3; border-radius: 14px;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08); padding: 22px 24px 26px;
      }

      .od-login-gate { text-align: center; padding: 40px 20px; }
      .od-login-icon { font-size: 2.4em; line-height: 1; margin-bottom: 10px; }
      .od-login-title { font-size: 1.15em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .od-login-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .od-header { margin-bottom: 16px; }
      .od-title { margin: 0 0 4px; font-size: 1.5em; color: ${this.brandColor}; }
      .od-intro { margin: 0; color: #667080; }

      .od-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
      .od-search {
        flex: 1 1 220px; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.95em;
      }
      .od-distance-search { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .od-zip-input { width: 120px; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.95em; }
      .od-distance-search select { padding: 9px 8px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9em; }
      .od-btn {
        padding: 9px 14px; border-radius: 8px; border: none; background: ${this.brandColor}; color: #fff;
        font-weight: 600; font-size: 0.9em; cursor: pointer; white-space: nowrap;
      }
      .od-btn-clear { background: #e9ecef; color: #555; }
      .od-btn-secondary { background: #fff; color: ${this.brandColor}; border: 1px solid ${this.brandColor}; }

      .od-toggle-group { display: flex; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
      .od-toggle {
        padding: 8px 14px; border: none; background: #fff; color: #555; cursor: pointer; font-size: 0.88em; font-weight: 600;
      }
      .od-toggle.active { background: ${this.brandColor}; color: #fff; }

      .od-error-msg { background: #ffebee; color: #c62828; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 0.9em; }
      .od-count { color: #6b7a88; font-size: 0.88em; margin-bottom: 14px; }
      .od-empty { color: #6b7a88; padding: 24px; text-align: center; }

      .od-group { margin-bottom: 22px; }
      .od-group-heading {
        font-size: 0.85em; font-weight: 700; color: ${this.brandColor}; text-transform: uppercase;
        letter-spacing: 0.04em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid ${this.accentColor};
      }

      .od-cards { display: flex; flex-direction: column; gap: 12px; }
      .od-card {
        display: flex; gap: 14px; padding: 14px; border: 1px solid #e3ebf3; border-radius: 10px;
        background: #fff; transition: box-shadow 0.15s, border-color 0.15s;
      }
      .od-card:hover { border-color: ${this.brandColor}; box-shadow: 0 4px 16px rgba(30,60,90,0.12); }
      .od-logo { width: 64px; height: 64px; border-radius: 10px; object-fit: cover; background: #f4f8fb; flex: 0 0 auto; }
      .od-logo-monogram {
        display: flex; align-items: center; justify-content: center; font-size: 1.6em; font-weight: 700;
        color: #fff; background: ${this.brandColor};
      }
      .od-card-body { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
      .od-card-name {
        font-weight: 700; font-size: 1.05em; color: ${this.brandColor}; text-decoration: none; align-self: flex-start;
      }
      .od-card-name:hover { text-decoration: underline; }
      .od-card-category { font-size: 0.78em; color: ${this.brandColor}; font-weight: 600; text-transform: uppercase; }
      .od-card-desc { font-size: 0.88em; color: #667080; line-height: 1.4; }
      .od-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 0.85em; color: #6b7a88; margin-top: 2px; }
      .od-distance-chip { background: #eef4fb; color: ${this.brandColor}; padding: 3px 9px; border-radius: 999px; font-weight: 600; }
      .od-card-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .od-action-btn {
        display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 6px; border: 1px solid #ddd;
        background: #fff; color: #444; font-size: 0.85em; font-weight: 600; text-decoration: none; cursor: pointer;
      }
      .od-action-btn:hover { border-color: ${this.brandColor}; color: ${this.brandColor}; }
      .od-action-btn-primary { background: ${this.brandColor}; color: #fff; border-color: ${this.brandColor}; }
      .od-action-btn-primary:hover { background: #002855; border-color: #002855; color: #fff; }

      .od-rows { display: flex; flex-direction: column; gap: 2px; }
      .od-row {
        display: flex; align-items: center; gap: 12px; padding: 8px 10px; text-decoration: none; color: inherit;
        border-radius: 6px;
      }
      .od-row:hover { background: #f4f8fb; }
      .od-row .od-logo, .od-row .od-logo-monogram { width: 36px; height: 36px; border-radius: 6px; flex: 0 0 auto; font-size: 1em; }
      .od-row-info { flex: 1; min-width: 0; }
      .od-row-name { font-weight: 600; font-size: 0.92em; color: #2c3e50; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .od-row-meta { font-size: 0.8em; color: #6b7a88; }
      .od-row-distance { font-size: 0.8em; color: ${this.brandColor}; font-weight: 600; white-space: nowrap; }

      .od-load-more {
        display: block; margin: 18px auto 0; padding: 9px 18px; border-radius: 8px; border: 1px solid ${this.brandColor};
        background: #fff; color: ${this.brandColor}; font-weight: 600; cursor: pointer;
      }

      .od-layout { display: grid; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; }
      .od-map-panel { position: sticky; top: 20px; }
      .od-map-wrap { position: relative; }
      .od-map { height: 560px; border-radius: 10px; overflow: hidden; z-index: 0; }
      .od-map-loading {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: #f4f8fb; color: #6b7a88; border-radius: 10px; text-align: center; padding: 16px; box-sizing: border-box;
      }
      .od-map-error { color: #c62828; background: #fef3f2; }
      .od-map-hint { margin: 10px 2px 0; font-size: 0.82em; color: #6b7a88; line-height: 1.4; }

      .od-pin-popup strong { color: ${this.brandColor}; }
      .od-pin-popup div { font-size: 0.85em; color: #444; margin-top: 2px; }
      .od-pin-popup a { color: ${this.brandColor}; font-size: 0.85em; font-weight: 600; text-decoration: none; display: inline-block; margin-top: 4px; }
      .od-pin-popup a:hover { text-decoration: underline; }

      @media (max-width: 900px) {
        .od-layout { grid-template-columns: 1fr; }
        .od-map-panel { position: static; }
        .od-map { height: 360px; }
      }

      @media (max-width: 640px) {
        .od-card-wrap { padding: 16px; border-radius: 10px; }
      }
    `;
  }
}

customElements.define("next-organization-directory", OrganizationDirectoryWidget);
