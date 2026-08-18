import { MPNextWidget } from "../shared/base-widget";
import { loadScript } from "../shared/cdn-loader";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface MassEvent {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Congregation_ID: number;
  Congregation_Name: string;
  Registration_Active: boolean;
  Registrant_Count: number;
  Intention_Status: "Available" | "Reserved" | "Past";
}

// ── Constants ──

const FC_VERSION = "6.1.15";
const FC_CDN_BASE = `https://cdn.jsdelivr.net/npm/fullcalendar@${FC_VERSION}`;

const COLOR_AVAILABLE = "#388e3c";
const COLOR_RESERVED = "#d32f2f";
const COLOR_PAST = "#6c757d";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class MassIntentionCalendarWidget extends MPNextWidget {
  private fcLoaded = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private calendarInstance: any = null;
  private error: string | null = null;

  private eventTypeId: number | null = null;
  private congregationIds: string | undefined;
  private eventDetailUrlTemplate: string | undefined;
  private searchMonthsAhead = 12;
  private pageHeading = "Mass Intention Calendar";

  // "Find Next Available Mass" chain state
  private lastFound: MassEvent | null = null;
  private currentModalMass: MassEvent | null = null;

  static get observedAttributes() {
    return ["event-type-id", "congregation-ids", "event-detail-url-template", "search-months-ahead", "page-heading", "customcss"];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    if (name === "event-type-id") {
      const parsed = next ? parseInt(next, 10) : NaN;
      this.eventTypeId = !isNaN(parsed) && parsed > 0 ? parsed : null;
      this.calendarInstance?.refetchEvents();
    } else if (name === "congregation-ids") {
      this.congregationIds = next || undefined;
      this.calendarInstance?.refetchEvents();
    } else if (name === "event-detail-url-template") {
      this.eventDetailUrlTemplate = next || undefined;
    } else if (name === "search-months-ahead") {
      const parsed = next ? parseInt(next, 10) : NaN;
      this.searchMonthsAhead = !isNaN(parsed) && parsed > 0 ? parsed : 12;
    } else if (name === "page-heading") {
      this.pageHeading = next || "Mass Intention Calendar";
      if (this.fcLoaded) this.render();
    } else if (name === "customcss") {
      void this.applyCustomCss(next || null);
    }
  }

  async connectedCallback() {
    const eventTypeIdAttr = this.getAttribute("event-type-id");
    const parsedEventTypeId = eventTypeIdAttr ? parseInt(eventTypeIdAttr, 10) : NaN;
    this.eventTypeId = !isNaN(parsedEventTypeId) && parsedEventTypeId > 0 ? parsedEventTypeId : null;

    this.congregationIds = this.getAttribute("congregation-ids") || undefined;
    this.eventDetailUrlTemplate = this.getAttribute("event-detail-url-template") || undefined;
    const monthsAttr = this.getAttribute("search-months-ahead");
    const parsedMonths = monthsAttr ? parseInt(monthsAttr, 10) : NaN;
    this.searchMonthsAhead = !isNaN(parsedMonths) && parsedMonths > 0 ? parsedMonths : 12;
    this.pageHeading = this.getAttribute("page-heading") || "Mass Intention Calendar";

    this.injectStyles(this.getStyles());
    void this.applyCustomCss(this.getAttribute("customcss"));

    if (!this.eventTypeId) {
      this.error = "Missing required attribute: event-type-id. Find your Mass Event Type's ID on the Event Types page in MinistryPlatform.";
      this.render();
      return;
    }

    this.render();

    try {
      await loadScript(`${FC_CDN_BASE}/index.global.min.js`);
      this.fcLoaded = true;
      this.render();
      this.initCalendar();
    } catch {
      this.error = "Failed to load calendar library.";
      this.render();
      this.emit("massIntentionError", { error: this.error });
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

  private async fetchMassEvents(startStr: string, endStr: string): Promise<MassEvent[]> {
    const params = new URLSearchParams({ start: startStr, end: endStr, eventTypeId: String(this.eventTypeId) });
    if (this.congregationIds) params.set("congregationIds", this.congregationIds);

    const res = await this.fetch(`/api/embed/mass-intention-calendar?${params}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    const data: { events: MassEvent[] } = await res.json();
    return data.events;
  }

  private eventColor(status: MassEvent["Intention_Status"]): string {
    return status === "Past" ? COLOR_PAST : status === "Reserved" ? COLOR_RESERVED : COLOR_AVAILABLE;
  }

  // ── Calendar ──

  private adoptCalendarStyles(): void {
    const headStyles = document.querySelectorAll("head style");
    for (const style of headStyles) {
      const text = style.textContent || "";
      if (text.includes(".fc") || text.includes("fc-")) {
        const clone = style.cloneNode(true) as HTMLStyleElement;
        this.root.appendChild(clone);
      }
    }
  }

  private initCalendar(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FC = (window as any).FullCalendar;
    if (!FC) {
      this.error = "FullCalendar library not available.";
      this.render();
      return;
    }

    this.adoptCalendarStyles();

    const mount = this.root.querySelector<HTMLElement>("#nw-mic-mount");
    if (!mount) return;

    this.calendarInstance = new FC.Calendar(mount, {
      initialView: typeof window !== "undefined" && window.innerWidth < 640 ? "listWeek" : "dayGridMonth",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,dayGridWeek,dayGridDay,listWeek",
      },
      views: {
        dayGridMonth: { buttonText: "Month" },
        dayGridWeek: { buttonText: "Week" },
        dayGridDay: { buttonText: "Day" },
        listWeek: { buttonText: "List Week" },
      },
      height: "auto",
      // Day-grid views (Month/Week/Day) default to a dot+time+title row for
      // timed events; "block" renders the full colored bar instead. Has no
      // effect on list view, which always uses its own row layout.
      eventDisplay: "block",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: (info: { startStr: string; endStr: string }, success: (e: object[]) => void, failure: (e: Error) => void) => {
        this.fetchMassEvents(info.startStr, info.endStr)
          .then((events) => {
            this.updateSummary(events);
            success(
              events.map((e) => ({
                title: e.Event_Title,
                start: e.Event_Start_Date,
                end: e.Event_End_Date,
                id: String(e.Event_ID),
                color: this.eventColor(e.Intention_Status),
                classNames: [`nw-mic-${e.Intention_Status.toLowerCase()}`],
                extendedProps: { massEvent: e },
              }))
            );
          })
          .catch((err) => {
            this.emit("massIntentionError", { error: err instanceof Error ? err.message : String(err) });
            failure(err instanceof Error ? err : new Error(String(err)));
          });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventClick: (info: any) => {
        this.showMassModal(info.event.extendedProps.massEvent as MassEvent);
      },
    });
    this.calendarInstance.render();
  }

  // ── "Find Next Available Mass" ──

  private isAfter(e: MassEvent, anchor: MassEvent): boolean {
    if (e.Event_Start_Date !== anchor.Event_Start_Date) {
      return e.Event_Start_Date > anchor.Event_Start_Date;
    }
    return e.Event_ID > anchor.Event_ID;
  }

  private async findNextAvailable(anchor: MassEvent | null): Promise<MassEvent | undefined> {
    const now = new Date();
    const viewStart: Date = this.calendarInstance ? this.calendarInstance.view.currentStart : now;
    let searchFrom = viewStart > now ? viewStart : now;
    if (anchor) {
      const aStart = new Date(anchor.Event_Start_Date);
      if (aStart > searchFrom) searchFrom = aStart;
    }
    const end = new Date(searchFrom);
    end.setMonth(end.getMonth() + this.searchMonthsAhead);

    const events = await this.fetchMassEvents(searchFrom.toISOString(), end.toISOString());
    return events.find((e) => e.Intention_Status === "Available" && (!anchor || this.isAfter(e, anchor)));
  }

  private goToMass(mass: MassEvent): void {
    this.lastFound = mass;
    this.calendarInstance?.gotoDate(mass.Event_Start_Date);
    this.showMassModal(mass);
  }

  private async handleFindNextClick(): Promise<void> {
    const btn = this.root.querySelector<HTMLButtonElement>("#nw-mic-find-next");
    const msg = this.root.querySelector<HTMLElement>("#nw-mic-find-next-msg");
    if (!btn) return;
    if (msg) msg.textContent = "";
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Searching…";
    try {
      const next = await this.findNextAvailable(this.lastFound);
      if (!next) {
        if (msg) {
          msg.textContent = this.lastFound
            ? "No later Masses available. Press again to search from the beginning."
            : `No available Masses found in the next ${this.searchMonthsAhead} months.`;
        }
        this.lastFound = null;
        return;
      }
      this.goToMass(next);
    } catch (err) {
      if (msg) msg.textContent = "Something went wrong searching for available Masses.";
      this.emit("massIntentionError", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  private updateSummary(events: MassEvent[]): void {
    const el = this.root.querySelector<HTMLElement>("#nw-mic-summary");
    if (!el) return;
    const available = events.filter((e) => e.Intention_Status === "Available").length;
    el.innerHTML = `<strong>${available} Mass${available === 1 ? "" : "es"} available</strong>`;
  }

  // ── Modal ──

  private showMassModal(mass: MassEvent): void {
    this.currentModalMass = mass;

    const existing = this.root.querySelector(".nw-mic-modal-overlay");
    if (existing) existing.remove();

    const start = new Date(mass.Event_Start_Date);
    const end = new Date(mass.Event_End_Date);
    const dtOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    };

    const description =
      mass.Intention_Status === "Past"
        ? "This Mass has already taken place."
        : mass.Intention_Status === "Available"
          ? "This Mass has no intention scheduled yet."
          : "A Mass intention has been scheduled for this Mass.";

    let actionButtonHtml = "";
    if (mass.Intention_Status !== "Past" && this.eventDetailUrlTemplate) {
      const href = this.eventDetailUrlTemplate.replace("{eventId}", String(mass.Event_ID));
      const label = mass.Intention_Status === "Available" ? "Request this Mass Intention" : "Event Details";
      const btnClass = mass.Intention_Status === "Available" ? "nw-mic-btn-available" : "nw-mic-btn-reserved";
      actionButtonHtml = `<a class="nw-mic-btn ${btnClass}" href="${escapeHtml(href)}">${label}</a>`;
    }

    const overlay = document.createElement("div");
    overlay.className = "nw-mic-modal-overlay";
    overlay.innerHTML = `
      <div class="nw-mic-modal nw-mic-modal-${mass.Intention_Status.toLowerCase()}">
        <div class="nw-mic-modal-header">
          <h3>${escapeHtml(mass.Event_Title)}</h3>
          <button class="nw-mic-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="nw-mic-modal-body">
          <p>${escapeHtml(mass.Congregation_Name)}</p>
          <p>Start: ${start.toLocaleString(undefined, dtOptions)}</p>
          <p>End: ${end.toLocaleString(undefined, dtOptions)}</p>
          <p>${description}</p>
        </div>
        <div class="nw-mic-modal-footer">
          <button class="nw-mic-btn nw-mic-btn-available" id="nw-mic-modal-find-next">Find Next Available Mass</button>
          ${actionButtonHtml}
        </div>
      </div>
    `;
    this.root.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector(".nw-mic-modal-close")?.addEventListener("click", () => overlay.remove());
    overlay.querySelector("#nw-mic-modal-find-next")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = "Searching…";
      try {
        const next = await this.findNextAvailable(this.currentModalMass);
        if (!next) {
          btn.textContent = "No later Masses available";
          return;
        }
        overlay.remove();
        this.goToMass(next);
      } catch (err) {
        btn.textContent = "Search failed — try again";
        btn.disabled = false;
        this.emit("massIntentionError", { error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  // ── Rendering ──

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="nw-mic-state nw-mic-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }

    if (!this.fcLoaded) {
      this.root.innerHTML = `<div class="nw-mic-state"><div class="nw-mic-spinner"></div><p>Loading calendar…</p></div>`;
      return;
    }

    this.root.innerHTML = `
      <div class="nw-mic-card">
        <h1>${escapeHtml(this.pageHeading)}</h1>
        <div class="nw-mic-header">
          <div class="nw-mic-legend">
            <span class="nw-mic-legend-label">Legend:</span>
            <span class="nw-mic-legend-chip nw-mic-legend-available">Intention Available</span>
            <span class="nw-mic-legend-chip nw-mic-legend-reserved">Intention Reserved</span>
            <span class="nw-mic-legend-chip nw-mic-legend-past">Past Mass</span>
          </div>
          <button type="button" id="nw-mic-find-next" class="nw-mic-find-next-btn">Find Next Available Mass</button>
        </div>
        <div class="nw-mic-summary">
          <span id="nw-mic-summary"></span> <span id="nw-mic-find-next-msg" class="nw-mic-find-next-msg"></span>
        </div>
        <div id="nw-mic-mount"></div>
      </div>
    `;

    this.root.querySelector("#nw-mic-find-next")?.addEventListener("click", () => this.handleFindNextClick());
  }

  // ── Styles ──

  private getStyles(): string {
    return `
      :host {
        display: block;
        font-family: ui-sans-serif, system-ui, sans-serif;
        color: var(--root-text-color);
        /* Overridable via the customcss attribute — see
           Administrators/Website/custom-styling.md */
        --primary: #004C97;
        --secondary: #002855;
        --accent: #F1BE48;
        --card-bgcolor: #ffffff;
        --root-text-color: #2D2926;
        --form-valid: #86AD3F;
        --form-invalid: #FF6D6A;
      }

      .nw-mic-state { text-align: center; padding: 32px 16px; color: #474747; }
      .nw-mic-state-error { color: #d32f2f; }
      .nw-mic-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: #2e6da4; border-radius: 50%;
        animation: nw-mic-spin 0.8s linear infinite;
      }
      @keyframes nw-mic-spin { to { transform: rotate(360deg); } }

      /* Bare tag selector, not scoped to a class — so a customcss file
         shared with classic MP widgets (whose own customcss files use
         plain h1 { ... } rules, since they have no built-in styles of
         their own to compete with) overrides this consistently, the same
         way it already overrides those classic widgets. */
      h1 { font-size: 1.4em; font-weight: 700; color: var(--secondary); margin: 0 0 16px; }

      .nw-mic-card {
        background: var(--card-bgcolor); border: 1px solid #e3ebf3; border-radius: 14px;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08); padding: 22px 24px 26px;
      }
      .nw-mic-header {
        display: flex; justify-content: space-between; align-items: center;
        flex-wrap: wrap; gap: 10px; margin-bottom: 4px;
      }
      .nw-mic-legend { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 0.88em; }
      .nw-mic-legend-label { color: #5a6b7b; }
      .nw-mic-legend-chip {
        display: inline-flex; align-items: center; border-radius: 6px; padding: 4px 12px;
        color: #fff; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.15);
      }
      .nw-mic-legend-available { background-color: ${COLOR_AVAILABLE}; }
      .nw-mic-legend-reserved { background-color: ${COLOR_RESERVED}; }
      .nw-mic-legend-past { background-color: ${COLOR_PAST}; }

      /* List view (listWeek/listDay): FullCalendar only colors the small dot
         by default — color the whole row to match the classic widget. */
      .fc-list-event.nw-mic-available td,
      .fc-list-event.nw-mic-reserved td,
      .fc-list-event.nw-mic-past td {
        color: #fff;
      }
      .fc-list-event.nw-mic-available td { background-color: ${COLOR_AVAILABLE} !important; }
      .fc-list-event.nw-mic-reserved td { background-color: ${COLOR_RESERVED} !important; }
      .fc-list-event.nw-mic-past td { background-color: ${COLOR_PAST} !important; }
      .fc-list-event.nw-mic-available:hover td { background-color: #2e7d32 !important; }
      .fc-list-event.nw-mic-reserved:hover td { background-color: #b71c1c !important; }
      .fc-list-event.nw-mic-past:hover td { background-color: #5a6268 !important; }
      .fc-list-event.nw-mic-available .fc-list-event-dot,
      .fc-list-event.nw-mic-reserved .fc-list-event-dot,
      .fc-list-event.nw-mic-past .fc-list-event-dot {
        border-color: #fff;
      }
      .fc-list-event.nw-mic-available a,
      .fc-list-event.nw-mic-reserved a,
      .fc-list-event.nw-mic-past a {
        color: #fff;
      }

      .nw-mic-find-next-btn {
        background-color: ${COLOR_AVAILABLE}; color: #fff; border: none; border-radius: 8px;
        padding: 0.55rem 1.15rem; font-size: 0.95em; font-weight: 600; cursor: pointer;
        box-shadow: 0 1px 3px rgba(0,0,0,0.18);
      }
      .nw-mic-find-next-btn:hover { background-color: #2e7d32; }
      .nw-mic-find-next-btn:disabled { opacity: 0.6; cursor: wait; }
      .nw-mic-find-next-msg { color: ${COLOR_RESERVED}; font-weight: 600; font-size: 0.9em; }
      .nw-mic-summary { font-size: 0.95em; color: #5a6b7b; margin: 4px 0 16px; min-height: 1.2em; }

      .nw-mic-modal-overlay {
        position: fixed; inset: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 1050; display: flex;
        align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;
      }
      .nw-mic-modal {
        background: var(--card-bgcolor); border-radius: 10px; box-shadow: 0 6px 28px rgba(0,0,0,0.3);
        overflow: hidden; max-width: 480px; width: 100%; border-top: 5px solid #2e6da4;
      }
      .nw-mic-modal-available { border-top-color: ${COLOR_AVAILABLE}; }
      .nw-mic-modal-reserved { border-top-color: ${COLOR_RESERVED}; }
      .nw-mic-modal-past { border-top-color: ${COLOR_PAST}; }
      .nw-mic-modal-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem; border-bottom: 1px solid #dee2e6;
      }
      .nw-mic-modal-header h3 { margin: 0; font-size: 1.15rem; }
      .nw-mic-modal-close {
        border: none; background: transparent; font-size: 1.5rem; line-height: 1;
        cursor: pointer; padding: 0; color: #6c757d;
      }
      .nw-mic-modal-body { padding: 1rem; }
      .nw-mic-modal-body p { margin: 0 0 8px; font-size: 0.95em; color: #3d4854; }
      .nw-mic-modal-footer {
        display: flex; justify-content: flex-end; align-items: center; gap: 8px;
        padding: 0.75rem 1rem; border-top: 1px solid #dee2e6;
      }
      .nw-mic-modal-footer #nw-mic-modal-find-next { margin-right: auto; }
      .nw-mic-btn {
        display: inline-block; padding: 0.5rem 1rem; border-radius: 6px; border: none;
        cursor: pointer; text-decoration: none; font-size: 0.9rem; font-weight: 600; color: #fff;
      }
      .nw-mic-btn-available { background-color: ${COLOR_AVAILABLE}; }
      .nw-mic-btn-reserved { background-color: ${COLOR_RESERVED}; }
      .nw-mic-btn:disabled { opacity: 0.6; cursor: wait; }

      @media (max-width: 640px) {
        .nw-mic-card { padding: 14px 12px 18px; border-radius: 10px; }
        .nw-mic-header { justify-content: center; }
        .nw-mic-find-next-btn { width: 100%; }
      }
    `;
  }
}

customElements.define("next-mass-intention-calendar", MassIntentionCalendarWidget);
