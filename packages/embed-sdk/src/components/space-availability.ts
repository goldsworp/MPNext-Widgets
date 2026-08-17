import { MPNextWidget } from "../shared/base-widget";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface SpaceCongregation {
  Congregation_ID: number;
  Congregation_Name: string;
}

interface SpaceBuilding {
  Building_ID: number;
  Building_Name: string;
}

interface SpaceRoom {
  Room_ID: number;
  Room_Name: string;
  Room_Number: string | null;
  Maximum_Capacity: number | null;
}

interface AvailabilityBlock {
  Room_ID: number;
  Room_Name: string;
  Start: string;
  End: string;
  Event_Title: string | null;
}

interface ReservationRequestInput {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  setupMinutes: number;
  cleanupMinutes: number;
  requestorName: string;
  requestorEmail: string;
  requestorPhone?: string;
  notes?: string;
}

interface ReservationRequestResult {
  result: "ok" | "conflict" | "error";
  message?: string;
  eventId?: number;
  eventRoomId?: number;
}

interface CurrentContact {
  name: string;
  email: string | null;
  phone: string | null;
}

// ── Helpers ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Format a Date as yyyy-mm-dd in local time (avoids UTC off-by-one).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseInputDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function parseWallClockParts(value: string): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return { y: Number(y), mo: Number(mo), d: Number(d), h: Number(h), mi: Number(mi) };
}

function formatTimeLabel(h: number, mi: number): string {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateLabel(y: number, mo: number, d: number): string {
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${DAY_NAMES_SHORT[dow]}, ${MONTH_NAMES[mo - 1]} ${d}`;
}

// Both Start and End are MP-domain wall-clock strings — formatted directly
// with no timezone math, same reasoning as organizationDirectoryService's
// Mass Schedule display.
function formatBlockRange(start: string, end: string): string {
  const s = parseWallClockParts(start);
  const e = parseWallClockParts(end);
  if (!s || !e) return `${start} – ${end}`;
  const sameDay = s.y === e.y && s.mo === e.mo && s.d === e.d;
  const startLabel = `${formatDateLabel(s.y, s.mo, s.d)} · ${formatTimeLabel(s.h, s.mi)}`;
  const endLabel = sameDay ? formatTimeLabel(e.h, e.mi) : `${formatDateLabel(e.y, e.mo, e.d)} · ${formatTimeLabel(e.h, e.mi)}`;
  return `${startLabel} – ${endLabel}`;
}

export class SpaceAvailabilityWidget extends MPNextWidget {
  // ── Configuration ──
  private congregationIds: string | undefined;
  private showDetailedInfo = true;
  private requireSignIn = false;
  private allowRequests = false;
  private notifyEmails: string | undefined;
  private defaultContactId: number | null = null;
  private eventTypeId: number | null = null;
  private programId: number | null = null;
  private visibilityLevelId = 1;
  private brandColor = "#004C97";

  // ── State ──
  private error: string | null = null;
  private authRequired = false;
  private loading = true;

  private congregations: SpaceCongregation[] = [];
  private selectedCongregationId: number | null = null;
  private congregationLocked = false;

  private buildings: SpaceBuilding[] = [];
  private selectedBuildingId: number | null = null;
  private loadingBuildings = false;

  private rooms: SpaceRoom[] = [];
  private roomSearch = "";
  private selectedRoomIds = new Set<number>();
  private loadingRooms = false;

  private rangeStart = "";
  private rangeEnd = "";

  private searching = false;
  private searchError: string | null = null;
  private blocks: AvailabilityBlock[] | null = null;

  private signedIn = false;
  private currentContact: CurrentContact | null = null;

  private showRequestForm = false;
  private submitting = false;
  private requestResult: ReservationRequestResult | null = null;

  static get observedAttributes() {
    return [
      "congregation-ids",
      "show-detailed-info",
      "require-sign-in",
      "allow-requests",
      "notify-emails",
      "default-contact-id",
      "event-type-id",
      "program-id",
      "visibility-level-id",
      "brand-color",
    ];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    this.readAttribute(name, next);
  }

  private readAttribute(name: string, next: string | null): void {
    switch (name) {
      case "congregation-ids":
        this.congregationIds = next || undefined;
        break;
      case "show-detailed-info":
        this.showDetailedInfo = next !== "false";
        break;
      case "require-sign-in":
        this.requireSignIn = next === "true";
        break;
      case "allow-requests":
        this.allowRequests = next === "true";
        break;
      case "notify-emails":
        this.notifyEmails = next || undefined;
        break;
      case "default-contact-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.defaultContactId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "event-type-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.eventTypeId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "program-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.programId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "visibility-level-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.visibilityLevelId = !isNaN(parsed) && parsed > 0 ? parsed : 1;
        break;
      }
      case "brand-color":
        this.brandColor = next || "#004C97";
        break;
    }
  }

  async connectedCallback() {
    for (const attr of SpaceAvailabilityWidget.observedAttributes) {
      this.readAttribute(attr, this.getAttribute(attr));
    }

    this.injectStyles(this.getStyles());
    this.render();

    try {
      const [congregations, me] = await Promise.all([this.fetchCongregations(), this.fetchMe()]);
      this.congregations = congregations;
      this.signedIn = me.signedIn;
      this.currentContact = me.contact;

      if (congregations.length === 1) {
        this.selectedCongregationId = congregations[0].Congregation_ID;
        this.congregationLocked = true;
        await this.loadBuildings();
      }
    } catch (err) {
      if (!this.authRequired) {
        this.error = "Error loading directory: " + (err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.loading = false;
      this.applyQuickRange("d7");
      this.render();
    }
  }

  // ── Data ──

  private buildParams(extra: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams(extra);
    if (this.requireSignIn) params.set("requireSignIn", "true");
    return params;
  }

  private async apiGet<T>(params: URLSearchParams): Promise<T> {
    const res = await this.fetch(`/api/embed/space-availability?${params}`);
    if (res.status === 401) {
      this.authRequired = true;
      throw new Error("Sign-in required");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  private async fetchCongregations(): Promise<SpaceCongregation[]> {
    const params = this.buildParams({ resource: "congregations" });
    if (this.congregationIds) params.set("congregationIds", this.congregationIds);
    const data = await this.apiGet<{ congregations: SpaceCongregation[] }>(params);
    return data.congregations;
  }

  private async fetchMe(): Promise<{ signedIn: boolean; contact: CurrentContact | null }> {
    const params = this.buildParams({ resource: "me" });
    return this.apiGet<{ signedIn: boolean; contact: CurrentContact | null }>(params);
  }

  private async fetchBuildings(congregationId: number): Promise<SpaceBuilding[]> {
    const params = this.buildParams({ resource: "buildings", congregationId: String(congregationId) });
    if (this.congregationIds) params.set("congregationIds", this.congregationIds);
    const data = await this.apiGet<{ buildings: SpaceBuilding[] }>(params);
    return data.buildings;
  }

  private async fetchRooms(buildingId: number): Promise<SpaceRoom[]> {
    const params = this.buildParams({ resource: "rooms", buildingId: String(buildingId) });
    const data = await this.apiGet<{ rooms: SpaceRoom[] }>(params);
    return data.rooms;
  }

  private async fetchAvailability(roomIds: number[], startIso: string, endIso: string): Promise<AvailabilityBlock[]> {
    const params = this.buildParams({
      resource: "availability",
      roomIds: roomIds.join(","),
      start: startIso,
      end: endIso,
      showDetailedInfo: String(this.showDetailedInfo),
    });
    const data = await this.apiGet<{ blocks: AvailabilityBlock[] }>(params);
    return data.blocks;
  }

  private async postReservationRequest(input: ReservationRequestInput): Promise<ReservationRequestResult> {
    const params = this.buildParams({
      eventTypeId: String(this.eventTypeId),
      programId: String(this.programId),
      visibilityLevelId: String(this.visibilityLevelId),
    });
    if (this.defaultContactId) params.set("defaultContactId", String(this.defaultContactId));
    if (this.notifyEmails) params.set("notifyEmails", this.notifyEmails);

    const res = await this.fetch(`/api/embed/space-availability/request?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.status === 401) {
      this.authRequired = true;
      throw new Error("Sign-in required");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok && res.status !== 409) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data as ReservationRequestResult;
  }

  private async loadBuildings(): Promise<void> {
    if (!this.selectedCongregationId) return;
    this.loadingBuildings = true;
    this.render();
    try {
      this.buildings = await this.fetchBuildings(this.selectedCongregationId);
    } catch (err) {
      if (!this.authRequired) {
        this.error = "Error loading buildings: " + (err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.loadingBuildings = false;
      this.render();
    }
  }

  private async loadRooms(): Promise<void> {
    if (!this.selectedBuildingId) return;
    this.loadingRooms = true;
    this.render();
    try {
      this.rooms = await this.fetchRooms(this.selectedBuildingId);
    } catch (err) {
      if (!this.authRequired) {
        this.error = "Error loading rooms: " + (err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.loadingRooms = false;
      this.render();
    }
  }

  // ── Date range ──

  private applyQuickRange(val: string): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    const end = new Date(today);
    switch (val) {
      case "today":
        end.setDate(end.getDate() + 1);
        break;
      case "week":
        end.setDate(end.getDate() + Math.max(1, 7 - today.getDay()));
        break;
      case "d7":
        end.setDate(end.getDate() + 7);
        break;
      case "d30":
        end.setDate(end.getDate() + 30);
        break;
      default:
        return;
    }
    this.rangeStart = ymd(start);
    this.rangeEnd = ymd(end);
    const startInput = this.root.querySelector<HTMLInputElement>("#sa-start-date");
    const endInput = this.root.querySelector<HTMLInputElement>("#sa-end-date");
    if (startInput) startInput.value = this.rangeStart;
    if (endInput) endInput.value = this.rangeEnd;
  }

  // ── Search ──

  private async handleSearch(): Promise<void> {
    const startInput = this.root.querySelector<HTMLInputElement>("#sa-start-date");
    const endInput = this.root.querySelector<HTMLInputElement>("#sa-end-date");
    if (!startInput || !endInput) return;

    this.searchError = null;

    if (this.selectedRoomIds.size === 0) {
      this.searchError = "Select at least one room to search.";
      this.render();
      return;
    }

    const startDate = parseInputDate(startInput.value);
    const endDate = parseInputDate(endInput.value);
    if (!startDate || !endDate) {
      this.searchError = "Please select a valid date range.";
      this.render();
      return;
    }
    if (startDate >= endDate) {
      this.searchError = "Start date must be before end date.";
      this.render();
      return;
    }
    this.rangeStart = startInput.value;
    this.rangeEnd = endInput.value;

    // End date is inclusive of the chosen day.
    const endExclusive = new Date(endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);

    this.searching = true;
    this.render();
    try {
      this.blocks = await this.fetchAvailability([...this.selectedRoomIds], startDate.toISOString(), endExclusive.toISOString());
      this.emit("availabilityChecked", { blockCount: this.blocks.length });
    } catch (err) {
      if (!this.authRequired) {
        this.searchError = "Error checking availability: " + (err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.searching = false;
      this.render();
    }
  }

  // ── Reservation request ──

  private showRequestFormError(message: string): void {
    this.requestResult = { result: "error", message };
    this.render();
  }

  private async handleSubmitRequest(): Promise<void> {
    const form = this.root.querySelector<HTMLElement>("#sa-request-form");
    if (!form) return;

    const roomSelect = form.querySelector<HTMLSelectElement>("#sa-req-room");
    const dateInput = form.querySelector<HTMLInputElement>("#sa-req-date");
    const startInput = form.querySelector<HTMLInputElement>("#sa-req-start");
    const endInput = form.querySelector<HTMLInputElement>("#sa-req-end");
    const setupInput = form.querySelector<HTMLInputElement>("#sa-req-setup");
    const cleanupInput = form.querySelector<HTMLInputElement>("#sa-req-cleanup");
    const nameInput = form.querySelector<HTMLInputElement>("#sa-req-name");
    const emailInput = form.querySelector<HTMLInputElement>("#sa-req-email");
    const phoneInput = form.querySelector<HTMLInputElement>("#sa-req-phone");
    const notesInput = form.querySelector<HTMLTextAreaElement>("#sa-req-notes");
    if (!roomSelect || !dateInput || !startInput || !endInput || !setupInput || !cleanupInput || !nameInput || !emailInput) return;

    const roomId = parseInt(roomSelect.value, 10);
    if (isNaN(roomId)) {
      this.showRequestFormError("Please choose a room.");
      return;
    }
    if (!dateInput.value || !startInput.value || !endInput.value) {
      this.showRequestFormError("Please fill in the date and times.");
      return;
    }
    if (!nameInput.value.trim() || !emailInput.value.trim()) {
      this.showRequestFormError("Please fill in your name and email.");
      return;
    }

    const input: ReservationRequestInput = {
      roomId,
      date: dateInput.value,
      startTime: startInput.value,
      endTime: endInput.value,
      setupMinutes: parseInt(setupInput.value, 10) || 0,
      cleanupMinutes: parseInt(cleanupInput.value, 10) || 0,
      requestorName: nameInput.value.trim(),
      requestorEmail: emailInput.value.trim(),
      requestorPhone: phoneInput?.value.trim() || undefined,
      notes: notesInput?.value.trim() || undefined,
    };

    this.submitting = true;
    this.render();
    try {
      const result = await this.postReservationRequest(input);
      this.requestResult = result;
      if (result.result === "ok") {
        this.showRequestForm = false;
        this.emit("reservationRequested", result);
        if (this.blocks !== null) {
          await this.handleSearch();
          return;
        }
      }
    } catch (err) {
      if (!this.authRequired) {
        this.requestResult = { result: "error", message: err instanceof Error ? err.message : String(err) };
      }
    } finally {
      this.submitting = false;
      this.render();
    }
  }

  // ── Event listeners ──

  private attachControlListeners(): void {
    this.root.querySelector<HTMLSelectElement>("#sa-congregation-select")?.addEventListener("change", async (e) => {
      const id = parseInt((e.target as HTMLSelectElement).value, 10);
      if (isNaN(id)) return;
      this.selectedCongregationId = id;
      this.selectedBuildingId = null;
      this.buildings = [];
      this.rooms = [];
      this.selectedRoomIds.clear();
      this.blocks = null;
      this.render();
      await this.loadBuildings();
    });

    this.root.querySelector<HTMLSelectElement>("#sa-building-select")?.addEventListener("change", async (e) => {
      const id = parseInt((e.target as HTMLSelectElement).value, 10);
      if (isNaN(id)) return;
      this.selectedBuildingId = id;
      this.rooms = [];
      this.selectedRoomIds.clear();
      this.blocks = null;
      this.render();
      await this.loadRooms();
    });

    const searchInput = this.root.querySelector<HTMLInputElement>("#sa-room-search");
    searchInput?.addEventListener("input", () => {
      this.roomSearch = searchInput.value;
      this.renderRoomList();
    });

    const quickRangeSelect = this.root.querySelector<HTMLSelectElement>("#sa-quick-range");
    quickRangeSelect?.addEventListener("change", () => {
      if (quickRangeSelect.value) this.applyQuickRange(quickRangeSelect.value);
    });
    ["#sa-start-date", "#sa-end-date"].forEach((sel) => {
      this.root.querySelector<HTMLInputElement>(sel)?.addEventListener("input", () => {
        if (quickRangeSelect) quickRangeSelect.value = "";
      });
    });

    this.root.querySelector("#sa-search-btn")?.addEventListener("click", () => this.handleSearch());

    this.root.querySelector("#sa-show-request-form")?.addEventListener("click", () => {
      this.showRequestForm = true;
      this.requestResult = null;
      this.render();
    });
    this.root.querySelector("#sa-cancel-request-form")?.addEventListener("click", () => {
      this.showRequestForm = false;
      this.requestResult = null;
      this.render();
    });
    this.root.querySelector("#sa-submit-request")?.addEventListener("click", () => this.handleSubmitRequest());

    this.renderRoomList();
  }

  private renderRoomList(): void {
    const container = this.root.querySelector<HTMLElement>("#sa-room-list");
    if (!container) return;

    const query = this.roomSearch.trim().toLowerCase();
    const filtered = this.rooms.filter(
      (r) => !query || r.Room_Name.toLowerCase().includes(query) || (r.Room_Number || "").toLowerCase().includes(query)
    );

    if (this.rooms.length === 0) {
      container.innerHTML = this.loadingRooms
        ? `<div class="sa-inline-spinner"></div>`
        : `<div class="sa-empty">No bookable rooms in this building.</div>`;
      return;
    }
    if (filtered.length === 0) {
      container.innerHTML = `<div class="sa-empty">No rooms match your search.</div>`;
      return;
    }

    container.innerHTML = filtered
      .map(
        (r) => `
          <label class="sa-room-item">
            <input type="checkbox" data-room-id="${r.Room_ID}" ${this.selectedRoomIds.has(r.Room_ID) ? "checked" : ""}>
            <span class="sa-room-name">${escapeHtml(r.Room_Name)}${r.Room_Number ? ` <span class="sa-room-number">(${escapeHtml(r.Room_Number)})</span>` : ""}</span>
            ${r.Maximum_Capacity ? `<span class="sa-room-capacity">Seats ${r.Maximum_Capacity}</span>` : ""}
          </label>
        `
      )
      .join("");

    container.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = parseInt(cb.dataset.roomId || "", 10);
        if (isNaN(id)) return;
        if (cb.checked) this.selectedRoomIds.add(id);
        else this.selectedRoomIds.delete(id);
      });
    });
  }

  // ── Rendering ──

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="sa-state sa-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="sa-card">
          <div class="sa-login-gate">
            <div class="sa-login-icon">🔒</div>
            <div class="sa-login-title">Please sign in to check room availability</div>
            <div class="sa-login-sub">Sign in above, then try again.</div>
          </div>
        </div>
      `;
      return;
    }

    if (this.loading) {
      this.root.innerHTML = `<div class="sa-state"><div class="sa-spinner"></div><p>Loading…</p></div>`;
      return;
    }

    this.root.innerHTML = `
      <div class="sa-card">
        <div class="sa-header">
          <h2 class="sa-title">Check Room Availability</h2>
        </div>

        ${
          !this.congregationLocked
            ? `
          <div class="sa-step">
            <label class="sa-label" for="sa-congregation-select">Congregation</label>
            <select id="sa-congregation-select">
              <option value="">Select a congregation…</option>
              ${this.congregations
                .map(
                  (c) =>
                    `<option value="${c.Congregation_ID}" ${this.selectedCongregationId === c.Congregation_ID ? "selected" : ""}>${escapeHtml(c.Congregation_Name)}</option>`
                )
                .join("")}
            </select>
          </div>
        `
            : ""
        }

        ${
          this.selectedCongregationId
            ? `
          <div class="sa-step">
            <label class="sa-label" for="sa-building-select">Building</label>
            ${
              this.loadingBuildings
                ? `<div class="sa-inline-spinner"></div>`
                : `<select id="sa-building-select">
                     <option value="">Select a building…</option>
                     ${this.buildings
                       .map(
                         (b) =>
                           `<option value="${b.Building_ID}" ${this.selectedBuildingId === b.Building_ID ? "selected" : ""}>${escapeHtml(b.Building_Name)}</option>`
                       )
                       .join("")}
                   </select>`
            }
          </div>
        `
            : ""
        }

        ${
          this.selectedBuildingId
            ? `
          <div class="sa-step">
            <label class="sa-label">Room(s)</label>
            <input type="text" id="sa-room-search" placeholder="Filter rooms…" value="${escapeHtml(this.roomSearch)}">
            <div class="sa-room-list" id="sa-room-list"></div>
          </div>

          <div class="sa-step">
            <label class="sa-label">Date Range</label>
            <div class="sa-date-range">
              <select id="sa-quick-range">
                <option value="">Custom</option>
                <option value="today">Today</option>
                <option value="week">Rest of This Week</option>
                <option value="d7" selected>Next 7 Days</option>
                <option value="d30">Next 30 Days</option>
              </select>
              <input type="date" id="sa-start-date" value="${this.rangeStart}">
              <input type="date" id="sa-end-date" value="${this.rangeEnd}">
            </div>
          </div>

          ${this.searchError ? `<div class="sa-msg sa-msg-error">${escapeHtml(this.searchError)}</div>` : ""}

          <button type="button" class="sa-btn sa-btn-primary sa-search-btn" id="sa-search-btn" ${this.searching ? "disabled" : ""}>
            ${this.searching ? "Checking…" : "Check Availability"}
          </button>
        `
            : ""
        }

        ${this.blocks !== null ? this.renderResultsHtml() : ""}

        ${
          this.allowRequests && this.blocks !== null
            ? `
          <div class="sa-request-section">
            ${!this.showRequestForm ? `<button type="button" class="sa-btn sa-btn-secondary" id="sa-show-request-form">Request This Space</button>` : ""}
            ${this.renderRequestFormHtml()}
            ${!this.showRequestForm ? this.renderRequestResultHtml() : ""}
          </div>
        `
            : ""
        }
      </div>
    `;

    this.attachControlListeners();
  }

  private renderResultsHtml(): string {
    if (this.blocks === null) return "";
    if (this.blocks.length === 0) {
      return `<div class="sa-results"><div class="sa-empty">No reservations found for the selected rooms and date range.</div></div>`;
    }

    const byRoom = new Map<number, { name: string; blocks: AvailabilityBlock[] }>();
    for (const block of this.blocks) {
      const entry = byRoom.get(block.Room_ID);
      if (entry) entry.blocks.push(block);
      else byRoom.set(block.Room_ID, { name: block.Room_Name, blocks: [block] });
    }

    const sections = [...byRoom.values()]
      .map(
        (room) => `
          <div class="sa-room-results">
            <h3 class="sa-room-results-title">${escapeHtml(room.name)}</h3>
            <div class="sa-blocks">
              ${room.blocks
                .map(
                  (b) => `
                <div class="sa-block">
                  <span class="sa-block-time">${formatBlockRange(b.Start, b.End)}</span>
                  ${b.Event_Title ? `<span class="sa-block-title">${escapeHtml(b.Event_Title)}</span>` : `<span class="sa-block-title sa-block-busy">Reserved</span>`}
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `
      )
      .join("");

    return `<div class="sa-results">${sections}</div>`;
  }

  private renderRequestFormHtml(): string {
    if (!this.showRequestForm) return "";

    const prefillName = this.currentContact?.name || "";
    const prefillEmail = this.currentContact?.email || "";
    const prefillPhone = this.currentContact?.phone || "";
    const roomOptions = this.rooms.map((r) => `<option value="${r.Room_ID}">${escapeHtml(r.Room_Name)}</option>`).join("");

    return `
      <div class="sa-request-form" id="sa-request-form">
        <h3 class="sa-request-form-title">Request This Space</h3>
        <div class="sa-form-grid">
          <div class="sa-form-field">
            <label for="sa-req-room">Room</label>
            <select id="sa-req-room">
              <option value="">Select a room…</option>
              ${roomOptions}
            </select>
          </div>
          <div class="sa-form-field">
            <label for="sa-req-date">Date</label>
            <input type="date" id="sa-req-date" value="${this.rangeStart}">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-start">Start Time</label>
            <input type="time" id="sa-req-start">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-end">End Time</label>
            <input type="time" id="sa-req-end">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-setup">Setup Minutes</label>
            <input type="number" id="sa-req-setup" min="0" value="0">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-cleanup">Cleanup Minutes</label>
            <input type="number" id="sa-req-cleanup" min="0" value="0">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-name">Your Name</label>
            <input type="text" id="sa-req-name" value="${escapeHtml(prefillName)}">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-email">Your Email</label>
            <input type="email" id="sa-req-email" value="${escapeHtml(prefillEmail)}">
          </div>
          <div class="sa-form-field">
            <label for="sa-req-phone">Your Phone (optional)</label>
            <input type="tel" id="sa-req-phone" value="${escapeHtml(prefillPhone)}">
          </div>
        </div>
        <div class="sa-form-field sa-form-field-full">
          <label for="sa-req-notes">Notes about the event (optional)</label>
          <textarea id="sa-req-notes" rows="3"></textarea>
        </div>
        ${this.renderRequestResultHtml()}
        <div class="sa-form-actions">
          <button type="button" class="sa-btn sa-btn-clear" id="sa-cancel-request-form">Cancel</button>
          <button type="button" class="sa-btn sa-btn-primary" id="sa-submit-request" ${this.submitting ? "disabled" : ""}>
            ${this.submitting ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    `;
  }

  private renderRequestResultHtml(): string {
    if (!this.requestResult) return "";
    const r = this.requestResult;
    const cls = r.result === "ok" ? "sa-msg-success" : r.result === "conflict" ? "sa-msg-warning" : "sa-msg-error";
    const text = r.result === "ok" ? "Your reservation request has been submitted." : r.message || "Something went wrong.";
    return `<div class="sa-msg ${cls}">${escapeHtml(text)}</div>`;
  }

  // ── Styles ──

  private getStyles(): string {
    return `
      :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; color: #2D2926; }

      .sa-state { text-align: center; padding: 32px 16px; color: #474747; }
      .sa-state-error { color: #d32f2f; }
      .sa-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: ${this.brandColor}; border-radius: 50%;
        animation: sa-spin 0.8s linear infinite;
      }
      .sa-inline-spinner {
        width: 18px; height: 18px; border: 2px solid #e3ebf3; border-top-color: ${this.brandColor};
        border-radius: 50%; animation: sa-spin 0.8s linear infinite;
      }
      @keyframes sa-spin { to { transform: rotate(360deg); } }

      .sa-card {
        background: #fff; border: 1px solid #e3ebf3; border-radius: 14px;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08); padding: 22px 24px 26px;
      }

      .sa-login-gate { text-align: center; padding: 40px 20px; }
      .sa-login-icon { font-size: 2.4em; line-height: 1; margin-bottom: 10px; }
      .sa-login-title { font-size: 1.15em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .sa-login-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .sa-header { margin-bottom: 18px; }
      .sa-title { margin: 0; font-size: 1.4em; color: ${this.brandColor}; }

      .sa-step { margin-bottom: 18px; }
      .sa-label { display: block; margin-bottom: 6px; font-weight: 600; color: #34495e; font-size: 0.92em; }

      .sa-step select, .sa-step input[type="text"], .sa-step input[type="date"] {
        width: 100%; padding: 9px 11px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95em; background: #fff; box-sizing: border-box;
      }
      #sa-room-search { margin-bottom: 10px; }

      .sa-room-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid #e3ebf3; border-radius: 8px; padding: 6px; }
      .sa-room-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 5px; cursor: pointer; }
      .sa-room-item:hover { background: #f4f8fb; }
      .sa-room-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: ${this.brandColor}; flex: 0 0 auto; }
      .sa-room-name { flex: 1; font-size: 0.92em; color: #2D2926; }
      .sa-room-number { color: #6b7a88; font-weight: 400; }
      .sa-room-capacity { font-size: 0.8em; color: #6b7a88; white-space: nowrap; }

      .sa-date-range { display: flex; gap: 10px; flex-wrap: wrap; }
      .sa-date-range select, .sa-date-range input { flex: 1; min-width: 140px; padding: 9px 11px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95em; background: #fff; }

      .sa-btn { padding: 9px 18px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.92em; }
      .sa-btn-primary { background: ${this.brandColor}; color: #fff; }
      .sa-btn-primary:hover { background: #002855; }
      .sa-btn-secondary { background: #fff; color: ${this.brandColor}; border: 1px solid ${this.brandColor}; }
      .sa-btn-clear { background: #e9ecef; color: #555; margin-right: 8px; }
      .sa-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .sa-search-btn { margin-top: 4px; }

      .sa-msg { padding: 10px 14px; border-radius: 6px; margin: 12px 0; font-size: 0.9em; }
      .sa-msg-error { background: #ffebee; color: #c62828; }
      .sa-msg-warning { background: #fff8e1; color: #8d6e00; }
      .sa-msg-success { background: #e8f5e9; color: #2e7d32; }

      .sa-empty { color: #6b7a88; font-size: 0.9em; padding: 10px 2px; }

      .sa-results { margin-top: 20px; border-top: 1px solid #e3ebf3; padding-top: 16px; }
      .sa-room-results { margin-bottom: 16px; }
      .sa-room-results-title { margin: 0 0 8px; font-size: 1em; color: ${this.brandColor}; }
      .sa-blocks { display: flex; flex-direction: column; gap: 6px; }
      .sa-block {
        display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; padding: 8px 12px;
        background: #f4f8fb; border-radius: 6px; font-size: 0.9em;
      }
      .sa-block-time { font-weight: 600; color: #2D2926; white-space: nowrap; }
      .sa-block-title { color: #6b7a88; }
      .sa-block-busy { font-style: italic; }

      .sa-request-section { margin-top: 20px; border-top: 1px solid #e3ebf3; padding-top: 16px; }
      .sa-request-form { margin-top: 14px; background: #f9fbfd; border: 1px solid #e3ebf3; border-radius: 10px; padding: 18px; }
      .sa-request-form-title { margin: 0 0 14px; font-size: 1.05em; color: #34495e; }
      .sa-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 12px; }
      .sa-form-field label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; font-size: 0.85em; }
      .sa-form-field input, .sa-form-field select, .sa-form-field textarea {
        width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.92em; background: #fff; box-sizing: border-box; font-family: inherit;
      }
      .sa-form-field-full { margin-bottom: 14px; }
      .sa-form-actions { display: flex; justify-content: flex-end; margin-top: 6px; }

      @media (max-width: 640px) {
        .sa-card { padding: 16px; border-radius: 10px; }
        .sa-date-range { flex-direction: column; }
      }
    `;
  }
}

customElements.define("next-space-availability", SpaceAvailabilityWidget);
