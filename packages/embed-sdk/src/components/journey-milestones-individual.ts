import { MPNextWidget } from "../shared/base-widget";

interface JourneyMilestone {
  Milestone_ID: number;
  Milestone_Title: string;
  Icon: string | null;
  Sort_Order: number | null;
  Achieved: boolean;
  Date_Accomplished: string | null;
  Form_ID: number | null;
  Form_Title: string | null;
  Form_GUID: string | null;
  Event_ID: number | null;
  Event_Title: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3) return ymd;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export class JourneyMilestonesIndividualWidget extends MPNextWidget {
  private error: string | null = null;
  private authRequired = false;
  private loaded = false;
  private milestones: JourneyMilestone[] | null = null;

  private journeyId: number | null = null;
  private groupId: number | undefined;
  private formUrlTemplate = "";
  private eventDetailsUrlTemplate = "";
  private pageHeading = "My Journey";
  private showAllGetStartedButtons = true;

  static get observedAttributes() {
    return ["journey-id", "group-id", "form-url-template", "event-detail-url-template", "page-heading", "show-all-get-started-buttons", "customcss"];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    if (name === "journey-id") {
      const parsed = next ? parseInt(next, 10) : NaN;
      this.journeyId = !isNaN(parsed) && parsed > 0 ? parsed : null;
      if (this.isConnected && this.loaded) this.loadMilestones();
    } else if (name === "group-id") {
      const parsed = next ? parseInt(next, 10) : NaN;
      this.groupId = !isNaN(parsed) && parsed > 0 ? parsed : undefined;
      if (this.isConnected && this.loaded) this.loadMilestones();
    } else if (name === "form-url-template") {
      this.formUrlTemplate = next || "";
      if (this.loaded) this.render();
    } else if (name === "event-detail-url-template") {
      this.eventDetailsUrlTemplate = next || "";
      if (this.loaded) this.render();
    } else if (name === "page-heading") {
      this.pageHeading = next || "My Journey";
      if (this.loaded) this.render();
    } else if (name === "show-all-get-started-buttons") {
      this.showAllGetStartedButtons = next !== "false";
      if (this.loaded) this.render();
    } else if (name === "customcss") {
      void this.applyCustomCss(next || null);
    }
  }

  async connectedCallback() {
    const journeyIdAttr = this.getAttribute("journey-id");
    const parsedJourney = journeyIdAttr ? parseInt(journeyIdAttr, 10) : NaN;
    this.journeyId = !isNaN(parsedJourney) && parsedJourney > 0 ? parsedJourney : null;

    const groupIdAttr = this.getAttribute("group-id");
    const parsedGroup = groupIdAttr ? parseInt(groupIdAttr, 10) : NaN;
    this.groupId = !isNaN(parsedGroup) && parsedGroup > 0 ? parsedGroup : undefined;

    this.formUrlTemplate = this.getAttribute("form-url-template") || "";
    this.eventDetailsUrlTemplate = this.getAttribute("event-detail-url-template") || "";
    this.pageHeading = this.getAttribute("page-heading") || "My Journey";
    this.showAllGetStartedButtons = this.getAttribute("show-all-get-started-buttons") !== "false";

    this.injectStyles(this.getStyles());
    void this.applyCustomCss(this.getAttribute("customcss"));
    await this.loadMilestones();
  }

  private async loadMilestones(): Promise<void> {
    if (!this.journeyId) {
      this.error = "Missing required attribute: journey-id";
      this.render();
      return;
    }

    this.render();

    try {
      const params = new URLSearchParams({ journeyId: String(this.journeyId) });
      if (this.groupId) params.set("groupId", String(this.groupId));

      const res = await this.fetch(`/api/embed/journey-milestones-individual?${params}`);
      if (res.status === 401) {
        this.authRequired = true;
        this.loaded = true;
        this.render();
        return;
      }
      this.authRequired = false;
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data: { milestones: JourneyMilestone[] } = await res.json();
      this.error = null;
      this.loaded = true;
      this.milestones = data.milestones;
      this.render();
      this.emit("milestonesLoaded", { count: data.milestones.length });
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.loaded = true;
      this.render();
      this.emit("milestonesError", { error: this.error });
    }
  }

  private buildRow(m: JourneyMilestone, showButton: boolean): string {
    const done = m.Achieved;
    let meta: string;
    if (done) {
      meta = m.Date_Accomplished
        ? `<span class="jm-completed"><span class="jm-cd-label">Completed</span>${escapeHtml(formatDate(m.Date_Accomplished))}</span>`
        : `<span class="jm-completed">Completed</span>`;
    } else if (showButton && m.Event_ID && this.eventDetailsUrlTemplate) {
      const href = this.eventDetailsUrlTemplate.replace("{eventId}", encodeURIComponent(String(m.Event_ID)));
      meta = `<a class="jm-btn" href="${escapeHtml(href)}">Get Started</a>`;
    } else if (showButton && m.Form_GUID && this.formUrlTemplate) {
      const href = this.formUrlTemplate.replace("{formId}", encodeURIComponent(String(m.Form_GUID)));
      meta = `<a class="jm-btn" href="${escapeHtml(href)}">Get Started</a>`;
    } else {
      meta = "";
    }

    return `
      <div class="jm-row${done ? " jm-done" : ""}">
        <div class="jm-status${done ? " jm-checked" : ""}" role="img" aria-label="${done ? "Completed" : "Not completed"}">${done ? "&#10003;" : ""}</div>
        <div class="jm-title">${escapeHtml(m.Milestone_Title)}</div>
        <div class="jm-meta">${meta}</div>
      </div>
    `;
  }

  private renderList(milestones: JourneyMilestone[]): string {
    if (milestones.length === 0) {
      return `<p class="jm-msg-error">No milestones are set up for this journey yet.</p>`;
    }
    let actionShown = false;
    return `<div class="jm-list">${milestones
      .map((m) => {
        const hasAction = !m.Achieved && (m.Event_ID || m.Form_GUID);
        const showButton = !!hasAction && (this.showAllGetStartedButtons || !actionShown);
        if (showButton) actionShown = true;
        return this.buildRow(m, showButton);
      })
      .join("")}</div>`;
  }

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="jm-card"><div class="jm-msg-error">${escapeHtml(this.error)}</div></div>`;
      return;
    }

    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="jm-card">
          <div class="jm-gate">
            <div class="jm-gate-icon">&#128274;</div>
            <div class="jm-gate-title">Please sign in to view your journey.</div>
            <div class="jm-gate-sub">Your milestones will appear here automatically once you are signed in.</div>
          </div>
        </div>
      `;
      return;
    }

    if (!this.loaded) {
      this.root.innerHTML = `<div class="jm-card"><div class="jm-loading">Loading your journey&hellip;</div></div>`;
      return;
    }

    this.root.innerHTML = `
      <div class="jm-card">
        <h1 class="jm-heading">${escapeHtml(this.pageHeading)}</h1>
        ${this.milestones ? this.renderList(this.milestones) : ""}
      </div>
    `;
  }

  private getStyles(): string {
    return `
      :host {
        display: block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #2c3e50; line-height: 1.5;
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
      .jm-card { max-width: 760px; margin: 0 auto; background: var(--card-bgcolor); border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); padding: 28px; }
      /* Bare tag selector, not scoped to .jm-heading — so a customcss file
         shared with classic MP widgets (whose own customcss files use
         plain h1 { ... } rules, since they have no built-in styles of
         their own to compete with) overrides this consistently, the same
         way it already overrides those classic widgets. */
      h1 { font-size: 1.4em; font-weight: 700; color: #2c3e50; margin: 0 0 16px; }
      .jm-loading { text-align: center; color: #6b7a88; padding: 30px 0; }
      .jm-msg-error { background: #ffebee; color: #c62828; padding: 12px; border-radius: 6px; }

      .jm-gate { text-align: center; padding: 40px 20px; }
      .jm-gate-icon { font-size: 2.4em; line-height: 1; margin-bottom: 12px; color: #388e3c; }
      .jm-gate-title { font-size: 1.2em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .jm-gate-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .jm-list { display: flex; flex-direction: column; gap: 10px; }
      .jm-row {
        display: flex; align-items: center; gap: 16px; padding: 14px 16px;
        border: 1px solid #e6ebf1; border-radius: 10px; background: #fdfefe;
      }
      .jm-row.jm-done { background: #f3faf4; border-color: #cfe6d4; }
      .jm-status {
        flex: 0 0 auto; width: 26px; height: 26px; border-radius: 6px; border: 2px solid #c3ccd6;
        display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.95em;
      }
      .jm-status.jm-checked { background: #388e3c; border-color: #388e3c; }
      .jm-title { flex: 1 1 auto; font-weight: 600; color: #2c3e50; text-align: left; }
      .jm-meta { flex: 0 0 auto; text-align: right; white-space: nowrap; }
      .jm-completed { color: #2e7d32; font-size: 0.9em; font-weight: 600; display: block; text-align: right; }
      .jm-cd-label { display: block; font-size: 0.78em; font-weight: 500; color: #6b8a70; }
      .jm-btn {
        display: inline-block; background: #388e3c; color: #fff; text-decoration: none;
        padding: 8px 16px; border-radius: 999px; font-weight: 600; font-size: 0.9em;
      }
      .jm-btn:hover { background: #2e7d32; }

      @media (max-width: 560px) {
        .jm-card { padding: 18px; }
        .jm-row { gap: 12px; padding: 12px; }
      }
    `;
  }
}

customElements.define("next-journey-milestones-individual", JourneyMilestonesIndividualWidget);
