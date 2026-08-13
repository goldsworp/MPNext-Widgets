import { MPNextWidget } from "../shared/base-widget";
import { loadScript } from "../shared/cdn-loader";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface AdorationSlot {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Congregation_ID: number;
  Congregation_Name: string;
  Registration_Active: boolean;
  Registrant_Count: number;
  Slot_Status: "Needs Adorer" | "Adorer Committed";
  First_Participant: string | null;
}

interface RegisterResponse {
  result: "ok" | "error";
  message?: string;
  participantId?: number;
  requestedCount: number;
  registeredCount: number;
  registeredEventIds: number[];
}

// ── Constants ──

const FC_VERSION = "6.1.15";
const FC_CDN_BASE = `https://cdn.jsdelivr.net/npm/fullcalendar@${FC_VERSION}`;

const COLOR_AVAILABLE = "#388e3c";
const COLOR_RESERVED = "#d32f2f";
const COLOR_PAST = "#9e9e9e";

// Each covers a range of hours in 24-hour time [start, end).
const TIME_WINDOWS = [
  { name: "Midnight", start: 0, end: 4 },
  { name: "Early Morning", start: 4, end: 8 },
  { name: "Morning", start: 8, end: 12 },
  { name: "Midday", start: 12, end: 16 },
  { name: "Afternoon", start: 16, end: 20 },
  { name: "Evening", start: 20, end: 24 },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SUCCESS_TITLE = "You're signed up";
const DEFAULT_SUCCESS_MESSAGE =
  "You're signed up for {count} adoration slot(s). Thank you for saying yes to time with the Lord.";
const DEFAULT_FAIL_TITLE = "Registration problem";
const DEFAULT_FAIL_MESSAGE =
  "We couldn't complete your registration. {error} Please try again, or contact the parish office.";

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

// Format a Date as yyyy-mm-dd in local time (avoids UTC off-by-one).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseInputDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export class PerpetualAdorationWidget extends MPNextWidget {
  private fcLoaded = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private calendarInstance: any = null;
  private error: string | null = null;
  private authRequired = false;

  private congregationIds: string | undefined;
  private successTitle = DEFAULT_SUCCESS_TITLE;
  private successMessage = DEFAULT_SUCCESS_MESSAGE;
  private failTitle = DEFAULT_FAIL_TITLE;
  private failMessage = DEFAULT_FAIL_MESSAGE;

  private allSlots: AdorationSlot[] = [];
  private selectedEventIds = new Set<number>();
  private selectedTimeWindow: number | null = null;
  private selectedDays = new Set<number>();
  private visibleRange: { start: Date; end: Date } | null = null;
  private searching = false;
  private registering = false;

  static get observedAttributes() {
    return ["congregation-ids", "success-title", "success-message", "fail-title", "fail-message"];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    if (name === "congregation-ids") {
      this.congregationIds = next || undefined;
    } else if (name === "success-title") {
      this.successTitle = next || DEFAULT_SUCCESS_TITLE;
    } else if (name === "success-message") {
      this.successMessage = next || DEFAULT_SUCCESS_MESSAGE;
    } else if (name === "fail-title") {
      this.failTitle = next || DEFAULT_FAIL_TITLE;
    } else if (name === "fail-message") {
      this.failMessage = next || DEFAULT_FAIL_MESSAGE;
    }
  }

  async connectedCallback() {
    this.congregationIds = this.getAttribute("congregation-ids") || undefined;
    this.successTitle = this.getAttribute("success-title") || DEFAULT_SUCCESS_TITLE;
    this.successMessage = this.getAttribute("success-message") || DEFAULT_SUCCESS_MESSAGE;
    this.failTitle = this.getAttribute("fail-title") || DEFAULT_FAIL_TITLE;
    this.failMessage = this.getAttribute("fail-message") || DEFAULT_FAIL_MESSAGE;

    this.injectStyles(this.getStyles());
    this.render();

    try {
      await loadScript(`${FC_CDN_BASE}/index.global.min.js`);
      this.fcLoaded = true;
      this.render();
      this.attachControlListeners();
      this.applyQuickRange("d30");
      const quickRangeSelect = this.root.querySelector<HTMLSelectElement>("#pa-quick-range");
      if (quickRangeSelect) quickRangeSelect.value = "d30";
    } catch {
      this.error = "Failed to load calendar library.";
      this.render();
      this.emit("adorationError", { error: this.error });
    }
  }

  disconnectedCallback() {
    if (this.calendarInstance) {
      try {
        this.calendarInstance.destroy();
      } catch {
        // ignore
      }
      this.calendarInstance = null;
    }
  }

  // ── Data ──

  private async fetchSlots(startStr: string, endStr: string): Promise<AdorationSlot[]> {
    const params = new URLSearchParams({ start: startStr, end: endStr });
    if (this.congregationIds) params.set("congregationIds", this.congregationIds);

    const res = await this.fetch(`/api/embed/perpetual-adoration?${params}`);
    if (res.status === 401) {
      this.authRequired = true;
      throw new Error("Sign-in required");
    }
    this.authRequired = false;
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data: { slots: AdorationSlot[] } = await res.json();
    return data.slots;
  }

  private async postRegistration(eventIds: number[]): Promise<RegisterResponse> {
    const res = await this.fetch("/api/embed/perpetual-adoration/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds }),
    });
    if (res.status === 401) {
      this.authRequired = true;
      throw new Error("Sign-in required");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.error) || `HTTP ${res.status}`);
    }
    return data as RegisterResponse;
  }

  // ── Search ──

  private async handleSearch(): Promise<void> {
    const startInput = this.root.querySelector<HTMLInputElement>("#pa-start-date");
    const endInput = this.root.querySelector<HTMLInputElement>("#pa-end-date");
    const errorEl = this.root.querySelector<HTMLElement>("#pa-error-msg");
    const infoEl = this.root.querySelector<HTMLElement>("#pa-info-msg");
    const searchBtn = this.root.querySelector<HTMLButtonElement>("#pa-search-btn");
    if (!startInput || !endInput || !searchBtn) return;

    const startDate = parseInputDate(startInput.value);
    const endDate = parseInputDate(endInput.value);
    if (errorEl) errorEl.style.display = "none";
    if (infoEl) infoEl.style.display = "none";

    if (!startDate || !endDate) {
      this.showError("Please select valid dates");
      return;
    }
    if (startDate > endDate) {
      this.showError("Start date must be before end date");
      return;
    }

    // The End Date is inclusive of the chosen day; the API filters
    // Event_Start_Date < end, so pass the day after to include the last day.
    const endExclusive = new Date(endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    this.visibleRange = { start: startDate, end: endExclusive };

    if (this.calendarInstance) {
      this.calendarInstance.setOption("visibleRange", this.visibleRange);
      this.calendarInstance.gotoDate(startDate);
    }

    this.searching = true;
    searchBtn.disabled = true;
    searchBtn.textContent = "Searching…";

    try {
      this.allSlots = await this.fetchSlots(startDate.toISOString(), endExclusive.toISOString());
      this.selectedEventIds.clear();
      const resultsSection = this.root.querySelector<HTMLElement>("#pa-results-section");
      if (resultsSection) resultsSection.style.display = "block";
      this.renderResults();
    } catch (err) {
      if (this.authRequired) {
        this.render();
      } else {
        this.showError("Error fetching adoration slots: " + (err instanceof Error ? err.message : String(err)));
        this.emit("adorationError", { error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      this.searching = false;
      searchBtn.disabled = false;
      searchBtn.textContent = "Find Available Slots";
    }
  }

  private filteredSlots(): AdorationSlot[] {
    return this.allSlots.filter((slot) => {
      const slotDate = new Date(slot.Event_Start_Date);
      const dayOfWeek = slotDate.getDay();
      const hour = slotDate.getHours();
      if (this.selectedDays.size > 0 && !this.selectedDays.has(dayOfWeek)) return false;
      if (this.selectedTimeWindow !== null) {
        const tw = TIME_WINDOWS[this.selectedTimeWindow];
        if (!(hour >= tw.start && hour < tw.end)) return false;
      }
      return true;
    });
  }

  private isCommitted(s: AdorationSlot): boolean {
    return s.Registrant_Count > 0;
  }
  private isPast(s: AdorationSlot): boolean {
    return new Date(s.Event_Start_Date) < new Date();
  }
  private isSchedulable(s: AdorationSlot): boolean {
    return !this.isCommitted(s) && !this.isPast(s);
  }
  private baseClass(s: AdorationSlot): string {
    if (this.isCommitted(s)) return "pa-reserved";
    return this.isPast(s) ? "pa-past" : "pa-available";
  }

  private renderResults(): void {
    const slots = this.filteredSlots();
    const schedulable = slots.filter((s) => this.isSchedulable(s));
    const committed = slots.filter((s) => this.isCommitted(s));

    const countEl = this.root.querySelector<HTMLElement>("#pa-results-count");
    if (countEl) {
      countEl.innerHTML = `<strong>${schedulable.length} needing an adorer, ${committed.length} committed</strong>`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = slots.map((slot) => {
      const committed = this.isCommitted(slot);
      const past = this.isPast(slot);
      const startTime = new Date(slot.Event_Start_Date).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return {
        id: String(slot.Event_ID),
        title: committed ? slot.First_Participant || "Adorer Committed" : startTime,
        start: slot.Event_Start_Date,
        end: slot.Event_End_Date,
        classNames: [this.baseClass(slot)],
        extendedProps: { slot, schedulable: this.isSchedulable(slot) },
      };
    });

    if (!this.calendarInstance) {
      this.initCalendar(events);
    } else {
      this.calendarInstance.getEventSources().forEach((src: { remove: () => void }) => src.remove());
      this.calendarInstance.addEventSource(events);
      requestAnimationFrame(() => this.calendarInstance.updateSize());
    }

    this.selectedEventIds.clear();
    this.buildTimeSlotSelector(schedulable);
    this.updateSelectionUI();
  }

  // ── Calendar ──

  private adoptCalendarStyles(): void {
    const headStyles = document.querySelectorAll("head style");
    for (const style of headStyles) {
      const text = style.textContent || "";
      if (text.includes(".fc") || text.includes("fc-")) {
        this.root.appendChild(style.cloneNode(true));
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private initCalendar(events: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FC = (window as any).FullCalendar;
    if (!FC) {
      this.error = "FullCalendar library not available.";
      this.render();
      return;
    }

    this.adoptCalendarStyles();

    const mount = this.root.querySelector<HTMLElement>("#pa-calendar");
    if (!mount) return;

    this.calendarInstance = new FC.Calendar(mount, {
      initialView: "dayGridMonth",
      initialDate: this.visibleRange?.start,
      height: "auto",
      fixedWeekCount: false,
      visibleRange: this.visibleRange,
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listRange",
      },
      views: {
        dayGridMonth: { buttonText: "Month" },
        timeGridWeek: { buttonText: "Week" },
        timeGridDay: { buttonText: "Day" },
        listRange: { type: "list", buttonText: "List" },
      },
      events,
      eventDisplay: "block",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventContent: (arg: any) => {
        const p = arg.event.extendedProps;
        const isMonth = arg.view.type === "dayGridMonth";
        const time = arg.event.start
          ? arg.event.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "";
        const slot: AdorationSlot = p.slot;
        let text: string;
        if (this.isCommitted(slot)) {
          const name = slot.First_Participant || "Adorer Committed";
          text = isMonth ? `${time} · ${name}` : name;
        } else if (this.isPast(slot)) {
          text = isMonth ? `${time} · Unfilled` : "Unfilled";
        } else {
          text = isMonth ? time : "Adorer Needed";
        }
        const chip = document.createElement("div");
        chip.className = "pa-chip";
        chip.textContent = text;
        return { domNodes: [chip] };
      },
      slotLabelInterval: "1:00",
      slotLabelFormat: { hour: "numeric" },
      slotMinTime: "00:00:00",
      slotMaxTime: "24:00:00",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      datesSet: (info: any) => {
        const isTimeGrid = info.view.type.indexOf("timeGrid") === 0;
        const desired = isTimeGrid ? 700 : "auto";
        if (this.calendarInstance && this.calendarInstance.getOption("height") !== desired) {
          this.calendarInstance.setOption("height", desired);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventClick: (info: any) => {
        if (!info.event.extendedProps.schedulable) return;
        const slotId = Number(info.event.id);
        if (this.selectedEventIds.has(slotId)) {
          this.selectedEventIds.delete(slotId);
        } else {
          this.selectedEventIds.add(slotId);
        }
        this.updateCalendarSelection();
        this.syncTimeSlotCards();
        this.updateSelectionUI();
      },
    });
    this.calendarInstance.render();
    requestAnimationFrame(() => this.calendarInstance.updateSize());
  }

  private updateCalendarSelection(): void {
    if (!this.calendarInstance) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.calendarInstance.getEvents().forEach((event: any) => {
      const base = this.baseClass(event.extendedProps.slot);
      if (this.selectedEventIds.has(Number(event.id))) {
        event.setProp("classNames", [base, "selected"]);
      } else {
        event.setProp("classNames", [base]);
      }
    });
  }

  // ── Quick-select by time ──

  private buildTimeSlotSelector(schedulable: AdorationSlot[]): void {
    const container = this.root.querySelector<HTMLElement>("#pa-timeslots-options");
    const selectorSection = this.root.querySelector<HTMLElement>("#pa-timeslots-selector");
    if (!container || !selectorSection) return;
    selectorSection.style.display = "block";

    if (schedulable.length === 0) {
      container.innerHTML = `<div class="pa-timeslot-empty">No available slots to select for this filter.</div>`;
      return;
    }

    const groups = new Map<string, AdorationSlot[]>();
    for (const slot of schedulable) {
      const timeStr = new Date(slot.Event_Start_Date).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      const list = groups.get(timeStr);
      if (list) list.push(slot);
      else groups.set(timeStr, [slot]);
    }

    const sortedKeys = [...groups.keys()].sort(
      (a, b) => new Date(`2000-01-01 ${a}`).getTime() - new Date(`2000-01-01 ${b}`).getTime()
    );

    container.innerHTML = sortedKeys
      .map((timeStr) => {
        const ids = groups.get(timeStr)!.map((s) => s.Event_ID);
        const count = ids.length;
        return `
          <div class="pa-timeslot-card" data-ids="${ids.join(",")}">
            <input type="checkbox" class="pa-ts-check" tabindex="-1" aria-hidden="true">
            <span class="pa-ts-info">
              <span class="pa-ts-time">${escapeHtml(timeStr)}</span>
              <span class="pa-ts-count">${count} available slot${count === 1 ? "" : "s"}</span>
            </span>
            <span class="pa-ts-action">Select all</span>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll<HTMLElement>(".pa-timeslot-card").forEach((card) => {
      card.addEventListener("click", () => {
        const ids = (card.dataset.ids || "").split(",").map(Number).filter(Boolean);
        const allSelected = ids.every((id) => this.selectedEventIds.has(id));
        if (allSelected) {
          ids.forEach((id) => this.selectedEventIds.delete(id));
        } else {
          ids.forEach((id) => this.selectedEventIds.add(id));
        }
        this.updateCalendarSelection();
        this.syncTimeSlotCards();
        this.updateSelectionUI();
      });
    });

    this.syncTimeSlotCards();
  }

  private syncTimeSlotCards(): void {
    this.root.querySelectorAll<HTMLElement>(".pa-timeslot-card").forEach((card) => {
      const ids = (card.dataset.ids || "").split(",").map(Number).filter(Boolean);
      if (ids.length === 0) return;
      const selCount = ids.filter((id) => this.selectedEventIds.has(id)).length;
      const check = card.querySelector<HTMLInputElement>(".pa-ts-check");
      const action = card.querySelector<HTMLElement>(".pa-ts-action");
      if (!check || !action) return;
      if (selCount === 0) {
        card.classList.remove("active");
        check.checked = false;
        check.indeterminate = false;
        action.textContent = "Select all";
      } else if (selCount === ids.length) {
        card.classList.add("active");
        check.checked = true;
        check.indeterminate = false;
        action.textContent = "Selected ✓";
      } else {
        card.classList.add("active");
        check.checked = false;
        check.indeterminate = true;
        action.textContent = `${selCount} of ${ids.length}`;
      }
    });
  }

  // ── Selection footer ──

  private updateSelectionUI(): void {
    const selectedCountEl = this.root.querySelector<HTMLElement>("#pa-selected-count");
    const footer = this.root.querySelector<HTMLElement>("#pa-selection-footer");
    if (!selectedCountEl || !footer) return;

    const n = this.selectedEventIds.size;
    selectedCountEl.innerHTML = n > 0 ? `<strong>${n} slot${n === 1 ? "" : "s"} selected</strong>` : "";

    if (n > 0) {
      footer.innerHTML = `
        <button type="button" class="pa-btn pa-btn-clear" id="pa-clear-selection">Clear Selection</button>
        <button type="button" class="pa-btn pa-btn-register" id="pa-confirm-register">Register for Selected (${n})</button>
      `;
      footer.querySelector("#pa-clear-selection")?.addEventListener("click", () => {
        this.selectedEventIds.clear();
        this.updateCalendarSelection();
        this.syncTimeSlotCards();
        this.updateSelectionUI();
      });
      footer.querySelector("#pa-confirm-register")?.addEventListener("click", () => this.showConfirmModal());
    } else {
      footer.innerHTML = "";
    }
  }

  // ── Registration flow ──

  private showConfirmModal(): void {
    const count = this.selectedEventIds.size;
    const overlay = this.root.querySelector<HTMLElement>("#pa-confirm-modal");
    const msg = this.root.querySelector<HTMLElement>("#pa-confirm-message");
    if (!overlay || !msg) return;
    msg.innerHTML = `Sign up as the adorer for <strong>${count}</strong> adoration slot${count === 1 ? "" : "s"}?`;
    overlay.classList.add("show");
  }

  private closeConfirmModal(): void {
    this.root.querySelector("#pa-confirm-modal")?.classList.remove("show");
  }

  private async handleRegister(): Promise<void> {
    this.closeConfirmModal();
    const ids = [...this.selectedEventIds];
    if (ids.length === 0 || this.registering) return;

    this.registering = true;
    const footer = this.root.querySelector<HTMLElement>("#pa-selection-footer");
    footer?.querySelectorAll("button").forEach((b) => (b.disabled = true));

    try {
      const result = await this.postRegistration(ids);
      await this.handleSearch();

      if (result.result !== "ok") {
        this.showResultModal(this.failTitle, fillTemplate(this.failMessage, { error: result.message || "" }));
        return;
      }

      const made = result.registeredCount;
      const requested = result.requestedCount || ids.length;
      const skipped = Math.max(0, requested - made);

      if (made > 0) {
        let msg = fillTemplate(this.successMessage, { count: made });
        if (skipped > 0) {
          msg += ` (${skipped} ${skipped === 1 ? "slot was" : "slots were"} skipped — already taken or already yours.)`;
        }
        this.showResultModal(this.successTitle, msg);
        this.emit("adorationRegistered", { count: made, eventIds: result.registeredEventIds });
      } else {
        this.showResultModal(
          this.failTitle,
          fillTemplate(this.failMessage, { error: "Those slots may already be taken or already yours." })
        );
      }
    } catch (err) {
      if (this.authRequired) {
        this.render();
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this.showResultModal(this.failTitle, fillTemplate(this.failMessage, { error: message }));
        this.emit("adorationError", { error: message });
      }
    } finally {
      this.registering = false;
      this.root.querySelector<HTMLElement>("#pa-selection-footer")?.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  private showResultModal(title: string, message: string): void {
    const overlay = this.root.querySelector<HTMLElement>("#pa-result-modal");
    const titleEl = this.root.querySelector<HTMLElement>("#pa-result-title");
    const msgEl = this.root.querySelector<HTMLElement>("#pa-result-message");
    if (!overlay || !titleEl || !msgEl) return;
    titleEl.textContent = title;
    msgEl.textContent = message;
    overlay.classList.add("show");
  }

  // ── Filters ──

  private applyQuickRange(val: string): void {
    const today = new Date();
    let start: Date, end: Date;
    if (val.charAt(0) === "m") {
      const n = parseInt(val.slice(1), 10);
      start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1 + n, 0);
    } else if (val.charAt(0) === "d") {
      const n = parseInt(val.slice(1), 10);
      start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      end = new Date(start);
      end.setDate(end.getDate() + n);
    } else if (val.charAt(0) === "p") {
      const n = parseInt(val.slice(1), 10);
      end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      start = new Date(end);
      start.setDate(start.getDate() - n);
    } else {
      return;
    }
    const startInput = this.root.querySelector<HTMLInputElement>("#pa-start-date");
    const endInput = this.root.querySelector<HTMLInputElement>("#pa-end-date");
    if (startInput) startInput.value = ymd(start);
    if (endInput) endInput.value = ymd(end);
  }

  private attachControlListeners(): void {
    // Time windows (single-select radios)
    const twContainer = this.root.querySelector<HTMLElement>("#pa-time-windows");
    if (twContainer) {
      twContainer.innerHTML = TIME_WINDOWS.map(
        (tw, idx) => `
          <div class="pa-time-window">
            <input type="radio" id="pa-tw-${idx}" name="pa-time-window" value="${idx}">
            <label for="pa-tw-${idx}">${escapeHtml(tw.name)}</label>
          </div>
        `
      ).join("");
      twContainer.querySelectorAll<HTMLInputElement>("input").forEach((radio, idx) => {
        radio.addEventListener("change", () => {
          if (radio.checked) {
            this.selectedTimeWindow = idx;
            if (this.allSlots.length > 0) this.renderResults();
          }
        });
      });
    }

    // Days of week (multi-select toggles)
    const dowContainer = this.root.querySelector<HTMLElement>("#pa-days-of-week");
    if (dowContainer) {
      dowContainer.innerHTML = DAY_LABELS.map(
        (label, idx) => `<button type="button" class="pa-day-btn" data-day="${idx}">${label}</button>`
      ).join("");
      dowContainer.querySelectorAll<HTMLButtonElement>(".pa-day-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const day = Number(btn.dataset.day);
          btn.classList.toggle("selected");
          if (btn.classList.contains("selected")) this.selectedDays.add(day);
          else this.selectedDays.delete(day);
          if (this.allSlots.length > 0) this.renderResults();
        });
      });
    }

    // Date range
    const quickRangeSelect = this.root.querySelector<HTMLSelectElement>("#pa-quick-range");
    quickRangeSelect?.addEventListener("change", () => {
      if (quickRangeSelect.value) this.applyQuickRange(quickRangeSelect.value);
    });
    ["#pa-start-date", "#pa-end-date"].forEach((sel) => {
      this.root.querySelector<HTMLInputElement>(sel)?.addEventListener("input", () => {
        if (quickRangeSelect) quickRangeSelect.value = "";
      });
    });

    this.root.querySelector("#pa-search-btn")?.addEventListener("click", () => this.handleSearch());
    this.root.querySelector("#pa-confirm-cancel")?.addEventListener("click", () => this.closeConfirmModal());
    this.root.querySelector("#pa-confirm-register")?.addEventListener("click", () => this.handleRegister());
    this.root.querySelector("#pa-result-ok")?.addEventListener("click", () => {
      this.root.querySelector("#pa-result-modal")?.classList.remove("show");
    });
  }

  private showError(msg: string): void {
    const el = this.root.querySelector<HTMLElement>("#pa-error-msg");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  }

  // ── Rendering ──

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="pa-state pa-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="pa-card">
          <div class="pa-login-gate">
            <div class="pa-login-icon">🔒</div>
            <div class="pa-login-title">Please sign in to view and reserve Perpetual Adoration times</div>
            <div class="pa-login-sub">Sign in above, then try again.</div>
          </div>
        </div>
      `;
      return;
    }

    if (!this.fcLoaded) {
      this.root.innerHTML = `<div class="pa-state"><div class="pa-spinner"></div><p>Loading calendar…</p></div>`;
      return;
    }

    this.root.innerHTML = `
      <div class="pa-card">
        <div class="pa-filter-section">
          <div class="pa-section-title">Preferred Time Windows</div>
          <div class="pa-time-windows" id="pa-time-windows"></div>
        </div>

        <div class="pa-filter-section">
          <div class="pa-section-title">Preferred Days of the Week</div>
          <div class="pa-days-of-week" id="pa-days-of-week"></div>
        </div>

        <div class="pa-filter-section">
          <div class="pa-section-title">How Far in the Future?</div>
          <div class="pa-date-range">
            <div class="pa-date-input-group">
              <label for="pa-quick-range">Quick range</label>
              <select id="pa-quick-range">
                <option value="d30">Next 30 Days</option>
                <option value="d60">Next 60 Days</option>
                <option value="d90">Next 90 Days</option>
                <option value="m1">Next Month</option>
                <option value="m2">Next 2 Months</option>
                <option value="m3">Next 3 Months</option>
                <option value="p30">Last 30 Days (view only)</option>
                <option value="p90">Last 90 Days (view only)</option>
                <option value="">Custom</option>
              </select>
            </div>
            <div class="pa-date-input-group">
              <label for="pa-start-date">Start Date</label>
              <input type="date" id="pa-start-date">
            </div>
            <div class="pa-date-input-group">
              <label for="pa-end-date">End Date</label>
              <input type="date" id="pa-end-date">
            </div>
            <button type="button" class="pa-search-btn" id="pa-search-btn">Find Available Slots</button>
          </div>
        </div>

        <div id="pa-error-msg" class="pa-error-msg" style="display:none;"></div>
        <div id="pa-info-msg" class="pa-info-msg" style="display:none;"></div>

        <div class="pa-results-section" id="pa-results-section" style="display:none;">
          <div class="pa-results-header">
            <div class="pa-results-count">
              <span id="pa-results-count"></span> <span id="pa-selected-count"></span>
            </div>
            <div class="pa-legend">
              <div class="pa-legend-item"><div class="pa-legend-color pa-legend-available"></div><span>Adorer Needed</span></div>
              <div class="pa-legend-item"><div class="pa-legend-color pa-legend-reserved"></div><span>Adorer Committed</span></div>
              <div class="pa-legend-item"><div class="pa-legend-color pa-legend-past"></div><span>Past (view only)</span></div>
            </div>
          </div>

          <div id="pa-calendar"></div>

          <div class="pa-timeslot-selector" id="pa-timeslots-selector" style="display:none;">
            <h3>Quick-select by time</h3>
            <p class="pa-timeslot-help">Pick an hour below to instantly select every available slot at that time across all the days shown.</p>
            <div class="pa-timeslot-options" id="pa-timeslots-options"></div>
          </div>

          <div class="pa-selection-footer" id="pa-selection-footer"></div>
        </div>
      </div>

      <div class="pa-modal-overlay" id="pa-confirm-modal">
        <div class="pa-modal">
          <div class="pa-modal-header">Confirm Selection</div>
          <div class="pa-modal-body" id="pa-confirm-message"></div>
          <div class="pa-modal-footer">
            <button type="button" class="pa-btn pa-btn-clear" id="pa-confirm-cancel">Cancel</button>
            <button type="button" class="pa-btn pa-btn-register" id="pa-confirm-register">Register</button>
          </div>
        </div>
      </div>

      <div class="pa-modal-overlay" id="pa-result-modal">
        <div class="pa-modal">
          <div class="pa-modal-header" id="pa-result-title"></div>
          <div class="pa-modal-body" id="pa-result-message"></div>
          <div class="pa-modal-footer">
            <button type="button" class="pa-btn pa-btn-register" id="pa-result-ok">OK</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Styles ──

  private getStyles(): string {
    return `
      :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; color: #2D2926; }

      .pa-state { text-align: center; padding: 32px 16px; color: #474747; }
      .pa-state-error { color: #d32f2f; }
      .pa-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: #2e6da4; border-radius: 50%;
        animation: pa-spin 0.8s linear infinite;
      }
      @keyframes pa-spin { to { transform: rotate(360deg); } }

      .pa-card {
        background: #fff; border: 1px solid #e3ebf3; border-radius: 14px;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08); padding: 22px 24px 26px;
      }

      .pa-login-gate { text-align: center; padding: 40px 20px; }
      .pa-login-icon { font-size: 2.4em; line-height: 1; margin-bottom: 10px; }
      .pa-login-title { font-size: 1.15em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .pa-login-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .pa-filter-section { margin-bottom: 24px; }
      .pa-section-title { font-size: 1.05em; font-weight: 600; color: #34495e; margin-bottom: 10px; }

      .pa-time-windows { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
      .pa-time-window { display: flex; align-items: center; gap: 8px; }
      .pa-time-window input[type="radio"] { cursor: pointer; width: 17px; height: 17px; accent-color: ${COLOR_AVAILABLE}; }
      .pa-time-window label { cursor: pointer; margin: 0; font-size: 0.92em; color: #555; }

      .pa-days-of-week { display: flex; flex-wrap: wrap; gap: 8px; }
      .pa-day-btn {
        min-width: 46px; padding: 7px 10px; border: 2px solid #ddd; border-radius: 6px;
        background: #fff; color: #555; cursor: pointer; font-weight: 500; font-size: 0.9em;
      }
      .pa-day-btn:hover { border-color: ${COLOR_AVAILABLE}; color: ${COLOR_AVAILABLE}; }
      .pa-day-btn.selected { background: ${COLOR_AVAILABLE}; color: #fff; border-color: ${COLOR_AVAILABLE}; }

      .pa-date-range { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
      .pa-date-input-group { flex: 1; min-width: 160px; }
      .pa-date-input-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; font-size: 0.88em; }
      .pa-date-input-group input, .pa-date-input-group select {
        width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95em; background: #fff;
      }
      .pa-search-btn {
        background: ${COLOR_AVAILABLE}; color: #fff; border: none; padding: 9px 20px;
        border-radius: 6px; font-weight: 600; font-size: 0.95em; cursor: pointer;
      }
      .pa-search-btn:hover { background: #2e7d32; }
      .pa-search-btn:disabled { background: #ccc; cursor: not-allowed; }

      .pa-error-msg { background: #ffebee; color: #c62828; padding: 11px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 0.92em; }
      .pa-info-msg { background: #e8f5e9; color: #2e7d32; padding: 11px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 0.92em; }

      .pa-results-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
      .pa-results-count { color: #666; font-size: 0.92em; }
      .pa-results-count strong { color: #2e7d32; }
      .pa-legend { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 0.88em; }
      .pa-legend-item { display: flex; align-items: center; gap: 7px; }
      .pa-legend-color { width: 18px; height: 18px; border-radius: 4px; }
      .pa-legend-available { background: ${COLOR_AVAILABLE}; }
      .pa-legend-reserved { background: ${COLOR_RESERVED}; }
      .pa-legend-past { background: ${COLOR_PAST}; }

      .pa-timeslot-selector { background: #f4f8f5; border: 1px solid #cfe3d5; border-radius: 8px; padding: 18px; margin: 18px 0; }
      .pa-timeslot-selector h3 { margin: 0 0 4px; font-size: 1em; color: #2c3e50; }
      .pa-timeslot-help { margin: 0 0 14px; font-size: 0.88em; color: #607080; line-height: 1.5; }
      .pa-timeslot-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
      .pa-timeslot-card {
        display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff;
        border: 2px solid #dce3ea; border-radius: 8px; cursor: pointer;
      }
      .pa-timeslot-card:hover { border-color: ${COLOR_AVAILABLE}; }
      .pa-timeslot-card.active { border-color: ${COLOR_AVAILABLE}; background: #e8f5e9; }
      .pa-ts-check { width: 18px; height: 18px; flex: 0 0 auto; pointer-events: none; accent-color: ${COLOR_AVAILABLE}; }
      .pa-ts-info { display: flex; flex-direction: column; flex: 1 1 auto; }
      .pa-ts-time { font-weight: 600; color: #2c3e50; font-size: 1em; }
      .pa-ts-count { font-size: 0.8em; color: #6b7a88; }
      .pa-ts-action { margin-left: auto; font-size: 0.8em; font-weight: 600; color: ${COLOR_AVAILABLE}; white-space: nowrap; border: 1px solid ${COLOR_AVAILABLE}; border-radius: 999px; padding: 3px 10px; background: #fff; }
      .pa-timeslot-card.active .pa-ts-action { background: ${COLOR_AVAILABLE}; color: #fff; }
      .pa-timeslot-empty { font-size: 0.9em; color: #6b7a88; }

      .pa-selection-footer { margin-top: 20px; text-align: right; }
      .pa-btn { padding: 9px 18px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; font-size: 0.92em; margin-left: 8px; }
      .pa-btn-register { background: ${COLOR_AVAILABLE}; color: #fff; }
      .pa-btn-register:hover { background: #2e7d32; }
      .pa-btn-clear { background: #e9ecef; color: #555; }
      .pa-btn-clear:hover { background: #dee2e6; }
      .pa-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* FullCalendar chip content */
      .fc .pa-chip { white-space: normal; overflow-wrap: anywhere; line-height: 1.2; font-weight: 600; font-size: 0.9em; }
      .fc .fc-daygrid-event.pa-available, .fc .fc-timegrid-event.pa-available { background-color: ${COLOR_AVAILABLE}; border-color: ${COLOR_AVAILABLE}; }
      .fc .fc-daygrid-event.pa-reserved, .fc .fc-timegrid-event.pa-reserved { background-color: ${COLOR_RESERVED}; border-color: ${COLOR_RESERVED}; }
      .fc .fc-daygrid-event.pa-past, .fc .fc-timegrid-event.pa-past { background-color: ${COLOR_PAST}; border-color: ${COLOR_PAST}; opacity: 0.85; }
      .fc .fc-daygrid-event.pa-available .fc-event-title, .fc .fc-timegrid-event.pa-available .fc-event-title,
      .fc .fc-daygrid-event.pa-reserved .fc-event-title, .fc .fc-timegrid-event.pa-reserved .fc-event-title {
        color: #fff;
      }
      .fc .fc-daygrid-event.selected, .fc .fc-timegrid-event.selected {
        box-shadow: inset 0 0 0 3px #fff, 0 0 0 4px #2e7d32 !important;
      }
      .fc .fc-list-event { cursor: pointer; }
      .fc .fc-list-event td { color: #2c3e50; }
      .fc .fc-list-event.pa-available .fc-list-event-dot { border-color: ${COLOR_AVAILABLE}; }
      .fc .fc-list-event.pa-reserved .fc-list-event-dot { border-color: ${COLOR_RESERVED}; }
      .fc .fc-list-event.pa-past .fc-list-event-dot { border-color: ${COLOR_PAST}; }
      .fc .fc-list-event.pa-past td { color: #9aa4ad; }
      .fc .fc-list-event.selected td { background: #e8f5e9 !important; }
      .fc .fc-daygrid-event.pa-reserved, .fc .fc-timegrid-event.pa-reserved, .fc .fc-list-event.pa-reserved,
      .fc .fc-daygrid-event.pa-past, .fc .fc-timegrid-event.pa-past, .fc .fc-list-event.pa-past { cursor: default; }

      .pa-modal-overlay {
        display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1050;
        align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
      }
      .pa-modal-overlay.show { display: flex; }
      .pa-modal { background: #fff; border-radius: 10px; padding: 22px; max-width: 460px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.3); }
      .pa-modal-header { font-size: 1.2em; font-weight: 600; margin-bottom: 14px; color: #2D2926; }
      .pa-modal-body { color: #555; margin-bottom: 18px; line-height: 1.55; }
      .pa-modal-footer { display: flex; justify-content: flex-end; gap: 8px; }

      @media (max-width: 640px) {
        .pa-card { padding: 16px; border-radius: 10px; }
        .pa-time-windows { grid-template-columns: repeat(2, 1fr); }
      }
    `;
  }
}

customElements.define("next-perpetual-adoration", PerpetualAdorationWidget);
