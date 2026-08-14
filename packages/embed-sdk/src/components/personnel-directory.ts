import { MPNextWidget } from "../shared/base-widget";

// ── Local types (mirrors @mpnext/types without importing) ───────────────

interface PersonnelAssignment {
  Role: string | null;
  Location: string | null;
  Congregation_ID: number | null;
}

interface PersonnelSummary {
  Personnel_ID: number;
  Display_Name: string;
  Personnel_Category_ID: number;
  Personnel_Category: string;
  Photo_URL: string | null;
  Phone: string | null;
  Email: string | null;
  Primary_Role: string | null;
  Primary_Location: string | null;
  Primary_Congregation_ID: number | null;
  Other_Assignments: PersonnelAssignment[];
}

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

export class PersonnelDirectoryWidget extends MPNextWidget {
  private loading = true;
  private error: string | null = null;
  private authRequired = false;
  private allPersonnel: PersonnelSummary[] = [];
  private searchTerm = "";
  private selectedCategoryId: number | null = null;

  // ── Config (attributes) ──
  private personnelCategoryIds: string | undefined;
  private congregationIds: string | undefined;
  private phoneSource: 1 | 2 | 3 = 1;
  private phoneStrictSource = false;
  private alternateEmailTypeId: number | null = null;
  private organizationDetailUrlTemplate: string | undefined;
  private pageTitle = "Personnel Directory";
  private pageIntro = "";
  private brandColor = "#004C97";
  private accentColor = "#F1BE48";
  private showPhotos = true;
  private requireSignIn = false;

  static get observedAttributes() {
    return [
      "personnel-category-ids",
      "congregation-ids",
      "phone-source",
      "phone-strict-source",
      "alternate-email-type-id",
      "organization-detail-url-template",
      "page-title",
      "page-intro",
      "brand-color",
      "accent-color",
      "show-photos",
      "require-sign-in",
    ];
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    this.readAttribute(name, next);
    if (this.loading) return;
    if (
      name === "personnel-category-ids" ||
      name === "congregation-ids" ||
      name === "phone-source" ||
      name === "phone-strict-source" ||
      name === "alternate-email-type-id" ||
      name === "require-sign-in"
    ) {
      void this.loadPersonnel();
    } else {
      this.render();
    }
  }

  private readAttribute(name: string, next: string | null): void {
    switch (name) {
      case "personnel-category-ids":
        this.personnelCategoryIds = next || undefined;
        break;
      case "congregation-ids":
        this.congregationIds = next || undefined;
        break;
      case "phone-source": {
        const parsed = next ? parseInt(next, 10) : 1;
        this.phoneSource = ([1, 2, 3].includes(parsed) ? parsed : 1) as 1 | 2 | 3;
        break;
      }
      case "phone-strict-source":
        this.phoneStrictSource = next === "true";
        break;
      case "alternate-email-type-id": {
        const parsed = next ? parseInt(next, 10) : NaN;
        this.alternateEmailTypeId = !isNaN(parsed) && parsed > 0 ? parsed : null;
        break;
      }
      case "organization-detail-url-template":
        this.organizationDetailUrlTemplate = next || undefined;
        break;
      case "page-title":
        this.pageTitle = next || "Personnel Directory";
        break;
      case "page-intro":
        this.pageIntro = next || "";
        break;
      case "brand-color":
        this.brandColor = next || "#004C97";
        break;
      case "accent-color":
        this.accentColor = next || "#F1BE48";
        break;
      case "show-photos":
        this.showPhotos = next !== "false";
        break;
      case "require-sign-in":
        this.requireSignIn = next === "true";
        break;
    }
  }

  async connectedCallback() {
    for (const attr of PersonnelDirectoryWidget.observedAttributes) {
      this.readAttribute(attr, this.getAttribute(attr));
    }

    this.injectStyles(this.getStyles());
    this.render();
    await this.loadPersonnel();
  }

  // ── Data ──

  private async loadPersonnel(): Promise<void> {
    this.loading = true;
    this.error = null;
    this.authRequired = false;
    this.render();

    try {
      const params = new URLSearchParams();
      if (this.personnelCategoryIds) params.set("personnelCategoryIds", this.personnelCategoryIds);
      if (this.congregationIds) params.set("congregationIds", this.congregationIds);
      params.set("phoneSource", String(this.phoneSource));
      if (this.phoneStrictSource) params.set("phoneStrictSource", "true");
      if (this.alternateEmailTypeId) params.set("alternateEmailTypeId", String(this.alternateEmailTypeId));
      if (this.requireSignIn) params.set("requireSignIn", "true");

      const res = await this.fetch(`/api/embed/personnel-directory?${params}`);
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
      const data: { personnel: PersonnelSummary[] } = await res.json();
      this.allPersonnel = data.personnel;
      this.loading = false;
      this.render();
    } catch (err) {
      this.error = "Error loading directory: " + (err instanceof Error ? err.message : String(err));
      this.loading = false;
      this.render();
      this.emit("personnelDirectoryError", { error: this.error });
    }
  }

  // ── Filtering ──

  private categories(): { id: number; name: string }[] {
    const map = new Map<number, string>();
    for (const p of this.allPersonnel) map.set(p.Personnel_Category_ID, p.Personnel_Category);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private matchesSearch(person: PersonnelSummary): boolean {
    if (!this.searchTerm) return true;
    const term = this.searchTerm.toLowerCase();
    const haystacks = [
      person.Display_Name,
      person.Primary_Role,
      person.Primary_Location,
      person.Personnel_Category,
      ...person.Other_Assignments.flatMap((a) => [a.Role, a.Location]),
    ];
    return haystacks.some((h) => h && h.toLowerCase().includes(term));
  }

  private filteredPersonnel(): PersonnelSummary[] {
    return this.allPersonnel
      .filter((p) => this.selectedCategoryId === null || p.Personnel_Category_ID === this.selectedCategoryId)
      .filter((p) => this.matchesSearch(p))
      .sort((a, b) => a.Display_Name.localeCompare(b.Display_Name));
  }

  // ── Rendering ──

  private locationHtml(location: string, congregationId: number | null): string {
    if (this.organizationDetailUrlTemplate && congregationId !== null) {
      const href = fillTemplate(this.organizationDetailUrlTemplate, { congregationId });
      return `<a class="pd-location-link" href="${escapeHtml(href)}">${escapeHtml(location)}</a>`;
    }
    return escapeHtml(location);
  }

  private personCardHtml(person: PersonnelSummary, showCategoryChip: boolean): string {
    const photo =
      this.showPhotos && person.Photo_URL
        ? `<img class="pd-photo" src="${escapeHtml(person.Photo_URL)}" alt="">`
        : `<div class="pd-photo pd-photo-monogram">${escapeHtml(person.Display_Name.charAt(0).toUpperCase())}</div>`;

    const primaryLine =
      person.Primary_Role || person.Primary_Location
        ? `<div class="pd-primary">
             ${person.Primary_Role ? escapeHtml(person.Primary_Role) : ""}${person.Primary_Role && person.Primary_Location ? " · " : ""}
             ${person.Primary_Location ? this.locationHtml(person.Primary_Location, person.Primary_Congregation_ID) : ""}
           </div>`
        : "";

    const otherAssignments =
      person.Other_Assignments.length > 0
        ? `<ul class="pd-other-assignments">
             ${person.Other_Assignments.map(
               (a) => `<li>${a.Role ? escapeHtml(a.Role) : ""}${a.Role && a.Location ? " · " : ""}${a.Location ? this.locationHtml(a.Location, a.Congregation_ID) : ""}</li>`
             ).join("")}
           </ul>`
        : "";

    return `
      <div class="pd-card">
        ${photo}
        <div class="pd-card-body">
          <div class="pd-name-row">
            <div class="pd-name">${escapeHtml(person.Display_Name)}</div>
            ${showCategoryChip ? `<span class="pd-category-chip">${escapeHtml(person.Personnel_Category)}</span>` : ""}
          </div>
          ${primaryLine}
          <div class="pd-contact">
            ${person.Phone ? `<a class="pd-contact-link" href="tel:${escapeHtml(person.Phone.replace(/[^\d+]/g, ""))}">${escapeHtml(person.Phone)}</a>` : ""}
            ${person.Email ? `<a class="pd-contact-link" href="mailto:${escapeHtml(person.Email)}">${escapeHtml(person.Email)}</a>` : ""}
          </div>
          ${otherAssignments}
        </div>
      </div>
    `;
  }

  render(): void {
    if (this.error) {
      this.root.innerHTML = `<div class="pd-state pd-state-error">${escapeHtml(this.error)}</div>`;
      return;
    }
    if (this.authRequired) {
      this.root.innerHTML = `
        <div class="pd-card-wrap">
          <div class="pd-login-gate">
            <div class="pd-login-icon">🔒</div>
            <div class="pd-login-title">Please sign in to view the directory</div>
            <div class="pd-login-sub">Sign in above, then try again.</div>
          </div>
        </div>
      `;
      return;
    }
    if (this.loading) {
      this.root.innerHTML = `<div class="pd-state"><div class="pd-spinner"></div><p>Loading directory…</p></div>`;
      return;
    }

    const categories = this.categories();
    const showCategorySelector = categories.length > 1;
    const people = this.filteredPersonnel();

    this.root.innerHTML = `
      <div class="pd-card-wrap">
        <div class="pd-header">
          <h2 class="pd-title">${escapeHtml(this.pageTitle)}</h2>
          ${this.pageIntro ? `<p class="pd-intro">${escapeHtml(this.pageIntro)}</p>` : ""}
        </div>

        <div class="pd-controls">
          <input type="search" id="pd-search" class="pd-search" placeholder="Search by name, role, or location…" value="${escapeHtml(this.searchTerm)}">
          ${
            showCategorySelector
              ? `
            <select id="pd-category-select" class="pd-category-select">
              <option value="">All Categories</option>
              ${categories.map((c) => `<option value="${c.id}" ${this.selectedCategoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
            </select>
          `
              : ""
          }
        </div>

        <div class="pd-count">${people.length} ${people.length === 1 ? "person" : "people"}</div>

        <div class="pd-list">
          ${
            people.length === 0
              ? `<div class="pd-empty">No one matches your search.</div>`
              : people.map((p) => this.personCardHtml(p, showCategorySelector)).join("")
          }
        </div>
      </div>
    `;

    this.attachControlListeners();
  }

  private attachControlListeners(): void {
    const searchInput = this.root.querySelector<HTMLInputElement>("#pd-search");
    searchInput?.addEventListener("input", () => {
      this.searchTerm = searchInput.value;
      this.render();
      this.root.querySelector<HTMLInputElement>("#pd-search")?.focus();
    });

    const categorySelect = this.root.querySelector<HTMLSelectElement>("#pd-category-select");
    categorySelect?.addEventListener("change", () => {
      this.selectedCategoryId = categorySelect.value ? parseInt(categorySelect.value, 10) : null;
      this.render();
    });
  }

  // ── Styles ──

  private getStyles(): string {
    return `
      :host { display: block; font-family: ui-sans-serif, system-ui, sans-serif; color: #2D2926; }

      .pd-state { text-align: center; padding: 32px 16px; color: #474747; }
      .pd-state-error { color: #d32f2f; }
      .pd-spinner {
        width: 28px; height: 28px; margin: 0 auto 12px;
        border: 3px solid #e3ebf3; border-top-color: ${this.brandColor}; border-radius: 50%;
        animation: pd-spin 0.8s linear infinite;
      }
      @keyframes pd-spin { to { transform: rotate(360deg); } }

      .pd-card-wrap {
        background: #fff; border: 1px solid #e3ebf3; border-radius: 14px;
        box-shadow: 0 2px 14px rgba(30,60,90,0.08); padding: 22px 24px 26px;
      }

      .pd-login-gate { text-align: center; padding: 40px 20px; }
      .pd-login-icon { font-size: 2.4em; line-height: 1; margin-bottom: 10px; }
      .pd-login-title { font-size: 1.15em; font-weight: 600; color: #34495e; margin-bottom: 8px; }
      .pd-login-sub { color: #667080; max-width: 480px; margin: 0 auto; line-height: 1.5; }

      .pd-header { margin-bottom: 16px; }
      .pd-title { margin: 0 0 4px; font-size: 1.5em; color: ${this.brandColor}; }
      .pd-intro { margin: 0; color: #667080; }

      .pd-controls { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
      .pd-search { flex: 1 1 220px; padding: 9px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.95em; }
      .pd-category-select { padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.9em; }

      .pd-count { color: #6b7a88; font-size: 0.88em; margin-bottom: 14px; }
      .pd-empty { color: #6b7a88; padding: 24px; text-align: center; }

      .pd-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
      .pd-card {
        display: flex; gap: 14px; padding: 14px; border: 1px solid #e3ebf3; border-radius: 10px; background: #fff;
      }
      .pd-photo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; background: #f4f8fb; }
      .pd-photo-monogram {
        display: flex; align-items: center; justify-content: center; font-size: 1.6em; font-weight: 700;
        color: #fff; background: ${this.brandColor};
      }
      .pd-card-body { flex: 1; min-width: 0; }
      .pd-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pd-name { font-weight: 700; font-size: 1.02em; color: #2c3e50; }
      .pd-category-chip {
        font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
        color: ${this.brandColor}; background: #eef4fb; padding: 2px 8px; border-radius: 999px;
      }
      .pd-primary { font-size: 0.9em; color: #444; margin-top: 2px; }
      .pd-location-link { color: ${this.brandColor}; text-decoration: none; }
      .pd-location-link:hover { text-decoration: underline; }
      .pd-contact { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; font-size: 0.88em; }
      .pd-contact-link { color: ${this.brandColor}; text-decoration: none; }
      .pd-contact-link:hover { text-decoration: underline; }
      .pd-other-assignments {
        list-style: none; margin: 8px 0 0; padding: 8px 0 0; border-top: 1px solid #f0f3f6;
        font-size: 0.82em; color: #6b7a88; display: flex; flex-direction: column; gap: 2px;
      }

      @media (max-width: 640px) {
        .pd-card-wrap { padding: 16px; border-radius: 10px; }
        .pd-list { grid-template-columns: 1fr; }
      }
    `;
  }
}

customElements.define("next-personnel-directory", PersonnelDirectoryWidget);
