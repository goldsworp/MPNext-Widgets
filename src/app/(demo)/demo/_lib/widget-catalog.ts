import { getMpHostForDocs } from "@/lib/embed/config";

export type WidgetCategory =
  | "Public"
  | "Authenticated"
  | "Staff / Admin"
  | "Authentication";

export interface WidgetControl {
  name: string;
  label: string;
  type: "number" | "select" | "text";
  attribute: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

export interface WidgetTab {
  label: string;
  attributes: Record<string, string>;
}

export interface WidgetConfig {
  slug: string;
  tag: string;
  title: string;
  description: string;
  category: WidgetCategory;
  needsUserMenu: boolean;
  needsMpWidgets: boolean;
  attributes: Record<string, string>;
  events: string[];
  controls?: WidgetControl[];
  tabs?: WidgetTab[];
  recaptchaSiteKey?: string;
  implementationCode: string;
}

export const RECAPTCHA_SITE_KEY = "6LeMwXQsAAAAALCfbMktsSEmklS8Bj52F89TA58w";

/** MP host without /ministryplatformapi suffix, for use in example snippets */
const mpHost = getMpHostForDocs();

export const widgetCatalog: WidgetConfig[] = [
  // ─── Authentication ───────────────────────────────────────────────
  {
    slug: "user-menu",
    tag: "next-user-menu",
    title: "User Menu",
    description: "Authentication widget with avatar dropdown and account modal. Deep-link via hash.",
    category: "Authentication",
    needsUserMenu: false,
    needsMpWidgets: true,
    attributes: {},
    events: ["userLogout", "accountModalOpen", "accountModalClose"],
    implementationCode: `<next-user-menu mp-base-url="${mpHost}"></next-user-menu>

<!-- With post-logout redirect -->
<next-user-menu
  mp-base-url="${mpHost}"
  post-logout-redirect-uri="${mpHost}"
></next-user-menu>

<!-- Deep-link to profile tab -->
<!-- Add #next-tab=profile to URL -->
<!-- Options: profile, family, giving, subscriptions, invoices -->`,
  },

  // ─── Public Widgets ───────────────────────────────────────────────
  {
    slug: "add-to-calendar",
    tag: "next-add-to-calendar",
    title: "Add to Calendar",
    description: "iCal/calendar export button for a single event.",
    category: "Public",
    needsUserMenu: false,
    needsMpWidgets: false,
    attributes: { "event-id": "1" },
    events: ["calendarEventLoaded", "addToCalendarError"],
    controls: [
      { name: "eventId", label: "Event ID", type: "number", attribute: "event-id", placeholder: "e.g. 1234" },
    ],
    implementationCode: `<next-add-to-calendar event-id="1234"></next-add-to-calendar>`,
  },
  {
    slug: "full-calendar",
    tag: "next-full-calendar",
    title: "Full Calendar",
    description: "Multi-view calendar with month, week, list, cards, and mini-cal views.",
    category: "Public",
    needsUserMenu: false,
    needsMpWidgets: false,
    attributes: {},
    events: ["calendarLoaded", "eventSelected", "viewChanged", "fullCalendarError"],
    controls: [
      {
        name: "view", label: "View", type: "select", attribute: "view",
        options: [
          { label: "Cards", value: "cards" },
          { label: "List", value: "list" },
          { label: "Month", value: "month" },
          { label: "Week", value: "week" },
          { label: "Calendar", value: "calendar" },
        ],
        defaultValue: "cards",
      },
      {
        name: "showToolbar", label: "Toolbar", type: "select", attribute: "show-toolbar",
        options: [
          { label: "Show", value: "true" },
          { label: "Hide", value: "false" },
        ],
        defaultValue: "true",
      },
      { name: "congregationId", label: "Congregation ID", type: "number", attribute: "congregation-id", placeholder: "e.g. 1" },
      { name: "eventDetailUrlTemplate", label: "Event Detail URL Template", type: "text", attribute: "event-detail-url-template", placeholder: "e.g. /events?id={eventId}" },
      { name: "campusLabel", label: "Campus Filter Label", type: "text", attribute: "campus-label", placeholder: "e.g. Parish" },
    ],
    implementationCode: `<next-full-calendar></next-full-calendar>

<!-- List view with toolbar hidden -->
<next-full-calendar view="list" show-toolbar="false"></next-full-calendar>

<!-- Filtered by congregation -->
<next-full-calendar congregation-id="1" view="month"></next-full-calendar>

<!-- Register button links to your own site's event page when MP has -->
<!-- online registration open but no external registration URL set -->
<next-full-calendar event-detail-url-template="/events?id={eventId}"></next-full-calendar>

<!-- Relabel the campus filter for orgs where "Campus" isn't the right term -->
<!-- (e.g. a diocese with Parishes). Lists over 8 options automatically get -->
<!-- a search box and a scrollable chip list instead of showing every chip. -->
<next-full-calendar campus-label="Parish"></next-full-calendar>`,
  },

  // ─── Authenticated Widgets ─────────────────────────────────────────
  {
    slug: "profile",
    tag: "next-profile",
    title: "Profile Editor",
    description: "Edit user profile fields including name, email, phone, and address.",
    category: "Authenticated",
    needsUserMenu: true,
    needsMpWidgets: true,
    attributes: {},
    events: ["profileLoaded", "profileSaved", "profileError", "passwordChanged", "passwordError"],
    implementationCode: `<next-profile></next-profile>`,
  },
  {
    slug: "my-invoices",
    tag: "next-my-invoices",
    title: "My Invoices",
    description: "View and manage user invoices with line item details.",
    category: "Authenticated",
    needsUserMenu: true,
    needsMpWidgets: true,
    attributes: {},
    events: ["invoicesLoaded", "invoiceSelected", "invoiceError"],
    implementationCode: `<next-my-invoices></next-my-invoices>`,
  },
  {
    slug: "faith-formation",
    tag: "next-faith-formation",
    title: "Family Faith Formation",
    description: "Household members' Faith Formation groups, leaders, and meeting history.",
    category: "Authenticated",
    // Fully native (no classic mpp-* elements) — auth comes from the host
    // app's own session, not the classic widget system, so neither flag
    // below is needed for this widget to function.
    needsUserMenu: false,
    needsMpWidgets: false,
    attributes: { "ministry-id": "13" },
    events: ["faithFormationLoaded", "faithFormationError"],
    controls: [
      { name: "ministryId", label: "Ministry ID", type: "number", attribute: "ministry-id", placeholder: "e.g. 13" },
      {
        name: "showLeaderEmail", label: "Show Leader Email", type: "select", attribute: "show-leader-email",
        options: [
          { label: "Show", value: "true" },
          { label: "Hide", value: "false" },
        ],
        defaultValue: "true",
      },
      {
        name: "showLeaderMobilePhone", label: "Show Leader Phone", type: "select", attribute: "show-leader-mobile-phone",
        options: [
          { label: "Show", value: "true" },
          { label: "Hide", value: "false" },
        ],
        defaultValue: "true",
      },
    ],
    implementationCode: `<next-faith-formation ministry-id="13"></next-faith-formation>

<!-- Hide leader contact info -->
<next-faith-formation
  ministry-id="13"
  show-leader-email="false"
  show-leader-mobile-phone="false"
></next-faith-formation>`,
  },
  {
    slug: "mass-intention-calendar",
    tag: "next-mass-intention-calendar",
    title: "Mass Intention Calendar",
    description: "Calendar of Masses showing intention availability, with a next-available finder.",
    category: "Public",
    needsUserMenu: false,
    needsMpWidgets: false,
    attributes: {},
    events: ["massIntentionError"],
    controls: [
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 4,8" },
      { name: "eventDetailUrlTemplate", label: "Event Detail URL Template", type: "text", attribute: "event-detail-url-template", placeholder: "e.g. /masses?id={eventId}" },
      { name: "searchMonthsAhead", label: "Search Months Ahead", type: "number", attribute: "search-months-ahead", placeholder: "e.g. 12" },
    ],
    implementationCode: `<next-mass-intention-calendar></next-mass-intention-calendar>

<!-- Filtered to specific congregations -->
<next-mass-intention-calendar congregation-ids="4,8"></next-mass-intention-calendar>

<!-- Link the modal's action button to your own site's Mass detail page -->
<next-mass-intention-calendar
  event-detail-url-template="/masses?id={eventId}"
></next-mass-intention-calendar>`,
  },
  {
    slug: "perpetual-adoration",
    tag: "next-perpetual-adoration",
    title: "Perpetual Adoration Calendar",
    description: "Signed-in parishioners find and claim open Perpetual Adoration hours.",
    category: "Authenticated",
    // Fully native (no classic mpp-* elements) — auth comes from the host
    // app's own session, not the classic widget system.
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: { "congregation-ids": "4" },
    events: ["adorationError", "adorationRegistered"],
    controls: [
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 4,8" },
      { name: "successTitle", label: "Success Title", type: "text", attribute: "success-title", placeholder: "e.g. You're signed up" },
      { name: "successMessage", label: "Success Message", type: "text", attribute: "success-message", placeholder: "Uses {count}" },
      { name: "failTitle", label: "Fail Title", type: "text", attribute: "fail-title", placeholder: "e.g. Registration problem" },
      { name: "failMessage", label: "Fail Message", type: "text", attribute: "fail-message", placeholder: "Uses {error}" },
    ],
    implementationCode: `<next-perpetual-adoration></next-perpetual-adoration>

<!-- Filtered to specific congregations -->
<next-perpetual-adoration congregation-ids="4,8"></next-perpetual-adoration>

<!-- Customize the confirmation dialog wording ({count} / {error} are replaced automatically) -->
<next-perpetual-adoration
  success-message="Thank you for saying yes to {count} hour(s) of adoration."
  fail-message="We couldn't complete that. {error}"
></next-perpetual-adoration>`,
  },
];

export function getWidgetBySlug(slug: string): WidgetConfig | undefined {
  return widgetCatalog.find((w) => w.slug === slug);
}

export function getWidgetsByCategory(): Record<WidgetCategory, WidgetConfig[]> {
  const grouped: Record<WidgetCategory, WidgetConfig[]> = {
    Public: [],
    Authenticated: [],
    "Staff / Admin": [],
    Authentication: [],
  };
  for (const widget of widgetCatalog) {
    grouped[widget.category].push(widget);
  }
  return grouped;
}
