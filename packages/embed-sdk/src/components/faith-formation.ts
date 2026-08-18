import { MPNextWidget } from "../shared/base-widget";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface FaithFormationLeader {
  Contact_ID: number;
  Display_Name: string;
  Photo_URL: string | null;
  Role_Title: string;
  Mobile_Phone: string | null;
  Email_Address: string | null;
}

interface FaithFormationMeeting {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Participation_Status_ID: number | null;
  Is_Present: boolean | null;
}

interface FaithFormationCurrentGroup {
  Group_Participant_ID: number;
  Group_ID: number;
  Group_Name: string;
  Participant_Start_Date: string;
  Participant_End_Date: string | null;
  Leaders: FaithFormationLeader[];
  UpcomingMeetings: FaithFormationMeeting[];
  PastMeetings: FaithFormationMeeting[];
}

interface FaithFormationPastGroup {
  Group_Participant_ID: number;
  Group_ID: number;
  Group_Name: string;
  Participant_Start_Date: string;
  Participant_End_Date: string | null;
  Total_Meetings: number;
  Attended_Meetings: number;
  Leaders: FaithFormationLeader[];
  Meetings: FaithFormationMeeting[];
}

interface FaithFormationPerson {
  Contact_ID: number;
  Display_Name: string;
  Photo_URL: string | null;
  CurrentGroups: FaithFormationCurrentGroup[];
  PastGroups: FaithFormationPastGroup[];
}

type Tab = "current" | "past";

const ICON_CHEVRON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const ICON_PHONE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const ICON_EMAIL = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;

export class FaithFormationWidget extends MPNextWidget {
  private loading = true;
  private error: string | null = null;
  private people: FaithFormationPerson[] = [];
  private ministryId: string | null = null;
  private showLeaderEmail = true;
  private showLeaderMobilePhone = true;
  private pageHeading = "Faith Formation";

  private expandedByContactId: Record<number, boolean> = {};
  private tabByContactId: Record<number, Tab> = {};
  private pastMeetingsOpenByGroupId: Record<number, boolean> = {};

  static get observedAttributes() {
    return ["ministry-id", "show-leader-email", "show-leader-mobile-phone", "page-heading", "customcss"];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    if (name === "ministry-id") {
      this.ministryId = next;
      if (this.isConnected) this.loadData();
    } else if (name === "show-leader-email") {
      this.showLeaderEmail = next !== "false";
      if (this.isConnected) this.loadData();
    } else if (name === "show-leader-mobile-phone") {
      this.showLeaderMobilePhone = next !== "false";
      if (this.isConnected) this.loadData();
    } else if (name === "page-heading") {
      this.pageHeading = next || "Faith Formation";
      if (!this.loading) this.render();
    } else if (name === "customcss") {
      void this.applyCustomCss(next || null);
    }
  }

  async connectedCallback() {
    this.ministryId = this.getAttribute("ministry-id");
    this.showLeaderEmail = this.getAttribute("show-leader-email") !== "false";
    this.showLeaderMobilePhone = this.getAttribute("show-leader-mobile-phone") !== "false";
    this.pageHeading = this.getAttribute("page-heading") || "Faith Formation";
    this.injectStyles(this.getStyles());
    void this.applyCustomCss(this.getAttribute("customcss"));
    this.render();
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    if (!this.ministryId) {
      this.loading = false;
      this.error = "Missing required ministry-id attribute.";
      this.render();
      this.emit("faithFormationError", { error: this.error });
      return;
    }

    this.loading = true;
    this.error = null;
    this.render();

    try {
      const params = new URLSearchParams({
        ministryId: this.ministryId,
        showLeaderEmail: String(this.showLeaderEmail),
        showLeaderMobilePhone: String(this.showLeaderMobilePhone),
      });
      const res = await this.fetch(`/api/embed/faith-formation?${params}`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: { people: FaithFormationPerson[] } = await res.json();
      this.people = data.people;
      this.loading = false;

      // Expand every person and default to the Current Groups tab, first load only.
      for (const person of this.people) {
        if (!(person.Contact_ID in this.expandedByContactId)) {
          this.expandedByContactId[person.Contact_ID] = true;
        }
        if (!(person.Contact_ID in this.tabByContactId)) {
          this.tabByContactId[person.Contact_ID] = "current";
        }
      }

      this.render();
      this.emit("faithFormationLoaded", { people: this.people });
    } catch (err) {
      this.loading = false;
      this.error = err instanceof Error ? err.message : "Failed to load Faith Formation data.";
      this.render();
      this.emit("faithFormationError", { error: this.error });
    }
  }

  public retryLoad() {
    this.loadData();
  }

  // ── Rendering ──

  render(): void {
    let html: string;
    if (this.loading) {
      html = this.renderLoading();
    } else if (this.error) {
      html = this.renderError();
    } else if (this.people.length === 0) {
      html = this.renderEmpty();
    } else {
      html = `<div class="nw-ff-people">${this.people.map((p) => this.renderPerson(p)).join("")}</div>`;
    }

    this.root.innerHTML = `<div class="nw-ff-root"><h1>${this.escapeHtml(this.pageHeading)}</h1>${html}</div>`;
    this.attachListeners();
  }

  private renderLoading(): string {
    return `
      <div class="nw-ff-state">
        <div class="nw-ff-spinner"></div>
        <p>Loading faith formation involvement…</p>
      </div>`;
  }

  private renderError(): string {
    return `
      <div class="nw-ff-state nw-ff-state-error">
        <p>${this.escapeHtml(this.error || "Something went wrong.")}</p>
        <button class="nw-ff-btn" data-action="retry">Try Again</button>
      </div>`;
  }

  private renderEmpty(): string {
    return `
      <div class="nw-ff-state">
        <p>No one in your household is currently involved in faith formation.</p>
      </div>`;
  }

  private renderAvatar(name: string, photoUrl: string | null): string {
    if (photoUrl) {
      return `<img class="nw-ff-avatar" src="${this.escapeHtml(photoUrl)}" alt="${this.escapeHtml(name)}" loading="lazy">`;
    }
    const initials = name
      .split(",")
      .reverse()
      .join(" ")
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return `<div class="nw-ff-avatar nw-ff-avatar-fallback">${this.escapeHtml(initials || "?")}</div>`;
  }

  private renderPerson(person: FaithFormationPerson): string {
    const expanded = this.expandedByContactId[person.Contact_ID] ?? true;
    const tab = this.tabByContactId[person.Contact_ID] ?? "current";

    return `
      <div class="nw-ff-person">
        <button class="nw-ff-person-header" data-action="toggle-person" data-contact-id="${person.Contact_ID}">
          ${this.renderAvatar(person.Display_Name, person.Photo_URL)}
          <span class="nw-ff-person-name">${this.escapeHtml(person.Display_Name)}</span>
          <span class="nw-ff-chevron ${expanded ? "nw-ff-chevron-open" : ""}">${ICON_CHEVRON}</span>
        </button>
        ${expanded ? this.renderPersonBody(person, tab) : ""}
      </div>`;
  }

  private renderPersonBody(person: FaithFormationPerson, tab: Tab): string {
    return `
      <div class="nw-ff-person-body">
        <div class="nw-ff-tabs">
          <button class="nw-ff-tab ${tab === "current" ? "nw-ff-tab-active" : ""}" data-action="tab" data-contact-id="${person.Contact_ID}" data-tab="current">
            Current Groups
          </button>
          <button class="nw-ff-tab ${tab === "past" ? "nw-ff-tab-active" : ""}" data-action="tab" data-contact-id="${person.Contact_ID}" data-tab="past">
            Past Groups
          </button>
        </div>
        ${
          tab === "current"
            ? person.CurrentGroups.length
              ? person.CurrentGroups.map((g) => this.renderCurrentGroup(g)).join("")
              : `<p class="nw-ff-no-groups">No current groups.</p>`
            : person.PastGroups.length
              ? person.PastGroups.map((g) => this.renderPastGroup(g)).join("")
              : `<p class="nw-ff-no-groups">No past groups.</p>`
        }
      </div>`;
  }

  private renderLeaders(leaders: FaithFormationLeader[]): string {
    if (leaders.length === 0) return "";
    return `
      <div class="nw-ff-leaders">
        ${leaders
          .map(
            (l) => `
          <div class="nw-ff-leader">
            ${this.renderAvatar(l.Display_Name, l.Photo_URL)}
            <div class="nw-ff-leader-info">
              <span class="nw-ff-leader-name">${this.escapeHtml(l.Display_Name)}</span>
              <span class="nw-ff-leader-role">${this.escapeHtml(l.Role_Title)}</span>
              <div class="nw-ff-leader-contact">
                ${l.Mobile_Phone ? `<a href="tel:${this.escapeHtml(l.Mobile_Phone)}">${ICON_PHONE} ${this.escapeHtml(l.Mobile_Phone)}</a>` : ""}
                ${l.Email_Address ? `<a href="mailto:${this.escapeHtml(l.Email_Address)}">${ICON_EMAIL} ${this.escapeHtml(l.Email_Address)}</a>` : ""}
              </div>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  private renderMeetingRow(m: FaithFormationMeeting, showAttendance: boolean): string {
    const dateStr = this.formatDate(m.Event_Start_Date);
    return `
      <div class="nw-ff-meeting-row">
        <span class="nw-ff-meeting-date">${dateStr}</span>
        <span class="nw-ff-meeting-title">${this.escapeHtml(m.Event_Title)}</span>
        ${
          showAttendance
            ? `<span class="nw-ff-badge ${m.Is_Present ? "nw-ff-badge-present" : "nw-ff-badge-absent"}">${m.Is_Present ? "Present" : "Absent"}</span>`
            : ""
        }
      </div>`;
  }

  private renderCurrentGroup(g: FaithFormationCurrentGroup): string {
    const pastOpen = this.pastMeetingsOpenByGroupId[g.Group_Participant_ID] ?? false;
    return `
      <div class="nw-ff-group">
        <div class="nw-ff-group-name">${this.escapeHtml(g.Group_Name)}</div>
        ${this.renderLeaders(g.Leaders)}
        ${
          g.UpcomingMeetings.length
            ? `<div class="nw-ff-meetings-section">
                <div class="nw-ff-meetings-label">Upcoming</div>
                ${g.UpcomingMeetings.map((m) => this.renderMeetingRow(m, false)).join("")}
              </div>`
            : ""
        }
        ${
          g.PastMeetings.length
            ? `<button class="nw-ff-meetings-toggle" data-action="toggle-past-meetings" data-group-participant-id="${g.Group_Participant_ID}">
                ${pastOpen ? "Hide" : "Show"} meeting history (${g.PastMeetings.length})
              </button>
              ${pastOpen ? `<div class="nw-ff-meetings-section">${g.PastMeetings.map((m) => this.renderMeetingRow(m, true)).join("")}</div>` : ""}`
            : ""
        }
      </div>`;
  }

  private renderPastGroup(g: FaithFormationPastGroup): string {
    const pastOpen = this.pastMeetingsOpenByGroupId[g.Group_Participant_ID] ?? false;
    return `
      <div class="nw-ff-group">
        <div class="nw-ff-group-name">${this.escapeHtml(g.Group_Name)}</div>
        <div class="nw-ff-group-dates">
          ${this.formatDate(g.Participant_Start_Date)} – ${g.Participant_End_Date ? this.formatDate(g.Participant_End_Date) : "present"}
        </div>
        <div class="nw-ff-attendance-summary">${g.Attended_Meetings} of ${g.Total_Meetings} meetings attended</div>
        ${this.renderLeaders(g.Leaders)}
        ${
          g.Meetings.length
            ? `<button class="nw-ff-meetings-toggle" data-action="toggle-past-meetings" data-group-participant-id="${g.Group_Participant_ID}">
                ${pastOpen ? "Hide" : "Show"} meeting history (${g.Meetings.length})
              </button>
              ${pastOpen ? `<div class="nw-ff-meetings-section">${g.Meetings.map((m) => this.renderMeetingRow(m, true)).join("")}</div>` : ""}`
            : ""
        }
      </div>`;
  }

  // ── Interaction ──

  private attachListeners(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="retry"]').forEach((el) => {
      el.addEventListener("click", () => this.retryLoad());
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-action="toggle-person"]').forEach((el) => {
      el.addEventListener("click", () => {
        const contactId = Number(el.dataset.contactId);
        this.expandedByContactId[contactId] = !(this.expandedByContactId[contactId] ?? true);
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-action="tab"]').forEach((el) => {
      el.addEventListener("click", () => {
        const contactId = Number(el.dataset.contactId);
        this.tabByContactId[contactId] = el.dataset.tab as Tab;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-action="toggle-past-meetings"]').forEach((el) => {
      el.addEventListener("click", () => {
        const groupParticipantId = Number(el.dataset.groupParticipantId);
        this.pastMeetingsOpenByGroupId[groupParticipantId] = !this.pastMeetingsOpenByGroupId[groupParticipantId];
        this.render();
      });
    });
  }

  // ── Utilities ──

  private formatDate(mpDatetime: string): string {
    const iso = mpDatetime.includes("T") ? mpDatetime : mpDatetime.replace(" ", "T");
    const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!parts) return mpDatetime;
    const [, year, month, day] = parts;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
      .nw-ff-root { max-width: 720px; }
      /* Bare tag selector, not scoped to a class — so a customcss file
         shared with classic MP widgets (whose own customcss files use
         plain h1 { ... } rules, since they have no built-in styles of
         their own to compete with) overrides this consistently, the same
         way it already overrides those classic widgets. */
      h1 { font-size: 1.4em; font-weight: 700; color: var(--secondary); margin: 0 0 16px; }

      .nw-ff-state { text-align: center; padding: 32px 16px; color: #474747; }
      .nw-ff-state-error { color: var(--form-invalid); }
      .nw-ff-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #D6F0FC; border-top-color: var(--primary); border-radius: 50%;
        animation: nw-ff-spin 0.8s linear infinite;
      }
      @keyframes nw-ff-spin { to { transform: rotate(360deg); } }

      .nw-ff-btn {
        margin-top: 12px; padding: 8px 20px; border-radius: 999px;
        border: 1.5px solid var(--primary); background: white; color: var(--primary);
        font-weight: 600; cursor: pointer;
      }
      .nw-ff-btn:hover { background: #D6F0FC; }

      .nw-ff-people { display: flex; flex-direction: column; gap: 12px; }

      .nw-ff-person {
        border: 1px solid #e5e5e5; border-radius: 12px; overflow: hidden; background: var(--card-bgcolor);
      }
      .nw-ff-person-header {
        width: 100%; display: flex; align-items: center; gap: 12px;
        padding: 14px 16px; background: none; border: none; cursor: pointer; text-align: left;
      }
      .nw-ff-person-name { flex: 1; font-weight: 700; font-size: 1.05em; color: var(--secondary); }
      .nw-ff-chevron { color: #474747; transition: transform 0.15s; display: flex; }
      .nw-ff-chevron-open { transform: rotate(180deg); }

      .nw-ff-avatar {
        width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
      }
      .nw-ff-avatar-fallback {
        display: flex; align-items: center; justify-content: center;
        background: var(--primary); color: white; font-weight: 700; font-size: 0.85em;
      }

      .nw-ff-person-body { padding: 0 16px 16px; border-top: 1px solid #f0f0f0; }

      .nw-ff-tabs { display: flex; gap: 4px; margin: 12px 0; }
      .nw-ff-tab {
        padding: 6px 16px; border-radius: 999px; border: 1.5px solid var(--primary);
        background: white; color: var(--primary); font-size: 0.85em; font-weight: 600; cursor: pointer;
      }
      .nw-ff-tab-active { background: var(--primary); color: white; }

      .nw-ff-no-groups { color: #474747; font-size: 0.9em; padding: 8px 0; }

      .nw-ff-group {
        background: #F7FAFC; border-radius: 10px; padding: 14px; margin-bottom: 10px;
      }
      .nw-ff-group-name { font-weight: 700; color: var(--secondary); margin-bottom: 4px; }
      .nw-ff-group-dates { font-size: 0.85em; color: #474747; margin-bottom: 4px; }
      .nw-ff-attendance-summary {
        font-size: 0.85em; font-weight: 600; color: var(--form-valid); margin-bottom: 8px;
      }

      .nw-ff-leaders { display: flex; flex-direction: column; gap: 8px; margin: 10px 0; }
      .nw-ff-leader { display: flex; align-items: center; gap: 10px; }
      .nw-ff-leader-info { display: flex; flex-direction: column; }
      .nw-ff-leader-name { font-weight: 600; font-size: 0.9em; }
      .nw-ff-leader-role { font-size: 0.8em; color: #474747; }
      .nw-ff-leader-contact { display: flex; gap: 12px; margin-top: 2px; }
      .nw-ff-leader-contact a {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 0.8em; color: #009CDE; text-decoration: none;
      }
      .nw-ff-leader-contact a:hover { text-decoration: underline; }

      .nw-ff-meetings-label {
        font-size: 0.75em; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.05em; color: #474747; margin: 8px 0 4px;
      }
      .nw-ff-meetings-section { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
      .nw-ff-meeting-row {
        display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 0.85em;
      }
      .nw-ff-meeting-date { color: #474747; min-width: 90px; }
      .nw-ff-meeting-title { flex: 1; }
      .nw-ff-badge {
        padding: 2px 8px; border-radius: 999px; font-size: 0.75em; font-weight: 600;
      }
      .nw-ff-badge-present { background: #EAF2DC; color: #5c7a2c; }
      .nw-ff-badge-absent { background: #FFE5E4; color: #b3413e; }

      .nw-ff-meetings-toggle {
        background: none; border: none; color: var(--primary); font-size: 0.8em;
        font-weight: 600; cursor: pointer; padding: 6px 0; text-align: left;
      }
      .nw-ff-meetings-toggle:hover { text-decoration: underline; }
    `;
  }
}

customElements.define("next-faith-formation", FaithFormationWidget);
