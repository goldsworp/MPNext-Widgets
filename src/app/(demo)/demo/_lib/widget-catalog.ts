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
    attributes: { "event-type-id": "13" },
    events: ["massIntentionError"],
    controls: [
      { name: "eventTypeId", label: "Event Type ID", type: "number", attribute: "event-type-id", placeholder: "e.g. 13" },
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 4,8" },
      { name: "eventDetailUrlTemplate", label: "Event Detail URL Template", type: "text", attribute: "event-detail-url-template", placeholder: "e.g. /masses?id={eventId}" },
      { name: "searchMonthsAhead", label: "Search Months Ahead", type: "number", attribute: "search-months-ahead", placeholder: "e.g. 12" },
    ],
    implementationCode: `<next-mass-intention-calendar event-type-id="13"></next-mass-intention-calendar>

<!-- Filtered to specific congregations -->
<next-mass-intention-calendar event-type-id="13" congregation-ids="4,8"></next-mass-intention-calendar>

<!-- Link the modal's action button to your own site's Mass detail page -->
<next-mass-intention-calendar
  event-type-id="13"
  event-detail-url-template="/masses?id={eventId}"
></next-mass-intention-calendar>

<!-- Widen or narrow how far ahead "Find Next Available Mass" searches (defaults to 12 months) -->
<next-mass-intention-calendar event-type-id="13" search-months-ahead="6"></next-mass-intention-calendar>`,
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
    attributes: { "event-type-id": "14", "congregation-ids": "4" },
    events: ["adorationError", "adorationRegistered"],
    controls: [
      { name: "eventTypeId", label: "Event Type ID", type: "number", attribute: "event-type-id", placeholder: "e.g. 14" },
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 4,8" },
      { name: "successTitle", label: "Success Title", type: "text", attribute: "success-title", placeholder: "e.g. You're signed up" },
      { name: "successMessage", label: "Success Message", type: "text", attribute: "success-message", placeholder: "Uses {count}" },
      { name: "failTitle", label: "Fail Title", type: "text", attribute: "fail-title", placeholder: "e.g. Registration problem" },
      { name: "failMessage", label: "Fail Message", type: "text", attribute: "fail-message", placeholder: "Uses {error}" },
    ],
    implementationCode: `<next-perpetual-adoration event-type-id="14"></next-perpetual-adoration>

<!-- Filtered to specific congregations -->
<next-perpetual-adoration event-type-id="14" congregation-ids="4,8"></next-perpetual-adoration>

<!-- Customize the confirmation dialog wording ({count} / {error} are replaced automatically) -->
<next-perpetual-adoration
  event-type-id="14"
  success-title="You're signed up"
  success-message="Thank you for saying yes to {count} hour(s) of adoration."
  fail-title="Registration problem"
  fail-message="We couldn't complete that. {error}"
></next-perpetual-adoration>`,
  },
  {
    slug: "journey-milestones-individual",
    tag: "next-journey-milestones-individual",
    title: "Milestone Tracker (Individual)",
    description: "A parishioner's progress through a Journey's milestones.",
    category: "Authenticated",
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: { "journey-id": "18", "group-id": "136" },
    events: ["milestonesLoaded", "milestonesError"],
    controls: [
      { name: "journeyId", label: "Journey ID", type: "number", attribute: "journey-id", placeholder: "e.g. 18" },
      { name: "groupId", label: "Group ID", type: "number", attribute: "group-id", placeholder: "e.g. 136" },
      { name: "pageHeading", label: "Page Heading", type: "text", attribute: "page-heading", placeholder: "e.g. My Journey" },
      { name: "formBaseUrl", label: "Form Base URL", type: "text", attribute: "form-base-url", placeholder: "e.g. /forms?id=" },
      { name: "eventDetailsPage", label: "Event Details URL", type: "text", attribute: "event-details-page", placeholder: "e.g. /events?id=" },
      {
        name: "showAllGetStartedButtons", label: "Get Started Buttons", type: "select", attribute: "show-all-get-started-buttons",
        options: [
          { label: "On every incomplete step", value: "true" },
          { label: "Only the next step", value: "false" },
        ],
        defaultValue: "true",
      },
    ],
    implementationCode: `<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
></next-journey-milestones-individual>

<!-- Link "Get Started" to your own site's form/event pages -->
<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
  form-base-url="/forms?id="
  event-details-page="/events?id="
></next-journey-milestones-individual>

<!-- Custom page heading -->
<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
  page-heading="My Confirmation Journey"
></next-journey-milestones-individual>

<!-- Only show "Get Started" on the next incomplete step, not every incomplete one -->
<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
  show-all-get-started-buttons="false"
></next-journey-milestones-individual>`,
  },
  {
    slug: "journey-milestones-family",
    tag: "next-journey-milestones-family",
    title: "Milestone Tracker (Family)",
    description: "Every household member's progress through a Journey's milestones.",
    category: "Authenticated",
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: { "journey-id": "18", "group-id": "136" },
    events: ["milestonesLoaded", "milestonesError"],
    controls: [
      { name: "journeyId", label: "Journey ID", type: "number", attribute: "journey-id", placeholder: "e.g. 18" },
      { name: "groupId", label: "Group ID", type: "number", attribute: "group-id", placeholder: "e.g. 136" },
      { name: "pageHeading", label: "Page Heading", type: "text", attribute: "page-heading", placeholder: "e.g. Our Journey" },
      { name: "formBaseUrl", label: "Form Base URL", type: "text", attribute: "form-base-url", placeholder: "e.g. /forms?id=" },
      { name: "eventDetailsPage", label: "Event Details URL", type: "text", attribute: "event-details-page", placeholder: "e.g. /events?id=" },
      {
        name: "showAllGetStartedButtons", label: "Get Started Buttons", type: "select", attribute: "show-all-get-started-buttons",
        options: [
          { label: "On every incomplete step", value: "true" },
          { label: "Only the next step", value: "false" },
        ],
        defaultValue: "true",
      },
    ],
    implementationCode: `<next-journey-milestones-family
  journey-id="18"
  group-id="136"
></next-journey-milestones-family>

<!-- Link "Get Started" to your own site's form/event pages -->
<next-journey-milestones-family
  journey-id="18"
  group-id="136"
  form-base-url="/forms?id="
  event-details-page="/events?id="
></next-journey-milestones-family>

<!-- Custom page heading -->
<next-journey-milestones-family
  journey-id="18"
  group-id="136"
  page-heading="Our Confirmation Journey"
></next-journey-milestones-family>

<!-- Only show "Get Started" on the next incomplete step, not every incomplete one -->
<next-journey-milestones-family
  journey-id="18"
  group-id="136"
  show-all-get-started-buttons="false"
></next-journey-milestones-family>`,
  },
  {
    slug: "organization-directory",
    tag: "next-organization-directory",
    title: "Organization Directory",
    description: "Public directory of parishes, schools, and other organizations — search, browse, and a map alongside the list.",
    category: "Public",
    // needsUserMenu is true here (unlike other Public widgets) so the demo
    // gallery can exercise the optional require-sign-in gate below — the
    // widget itself defaults to fully public, no sign-in required.
    needsUserMenu: true,
    needsMpWidgets: false,
    // Points "Details" links (and each result's own name link) at this demo
    // gallery's own Organization Detail page rather than the widget's
    // generic /organization-detail default, which isn't a real page here.
    attributes: { "detail-page-url-template": "/demo/organization-detail?id={congregationId}" },
    events: ["organizationDirectoryError"],
    controls: [
      {
        name: "requireSignIn", label: "Require Sign-in", type: "select", attribute: "require-sign-in",
        options: [
          { label: "No (public, default)", value: "false" },
          { label: "Yes (gate behind sign-in)", value: "true" },
        ],
        defaultValue: "false",
      },
      { name: "locationCategoryIds", label: "Location Category IDs", type: "text", attribute: "location-category-ids", placeholder: "e.g. 1,9,10" },
      { name: "pinnedCategoryIds", label: "Pinned Category IDs", type: "text", attribute: "pinned-category-ids", placeholder: "e.g. 4 (exempt from distance filter)" },
      { name: "browseGroupTypeId", label: "Browse Group Type ID", type: "number", attribute: "browse-group-type-id", placeholder: "e.g. 1 (Deanery)" },
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 1,2,4" },
      { name: "pageTitle", label: "Page Title", type: "text", attribute: "page-title", placeholder: "e.g. Find a Parish" },
      { name: "nounSingular", label: "Noun (Singular)", type: "text", attribute: "noun-singular", placeholder: "e.g. Parish" },
      { name: "nounPlural", label: "Noun (Plural)", type: "text", attribute: "noun-plural", placeholder: "e.g. Parishes" },
      { name: "detailPageUrlTemplate", label: "Detail Page URL Template", type: "text", attribute: "detail-page-url-template", placeholder: "/demo/organization-detail?id={congregationId}" },
      {
        name: "mapStyle", label: "Map Style", type: "select", attribute: "map-style",
        options: [
          { label: "Light", value: "light" },
          { label: "Street", value: "street" },
          { label: "Terrain", value: "terrain" },
        ],
        defaultValue: "light",
      },
      { name: "defaultRadius", label: "Default Search Radius", type: "number", attribute: "default-radius", placeholder: "e.g. 25" },
      {
        name: "units", label: "Distance Units", type: "select", attribute: "units",
        options: [
          { label: "Miles", value: "mi" },
          { label: "Kilometers", value: "km" },
        ],
        defaultValue: "mi",
      },
    ],
    implementationCode: `<next-organization-directory></next-organization-directory>

<!-- Only parishes and schools -->
<next-organization-directory location-category-ids="1,9"></next-organization-directory>

<!-- Enable "Browse by Deanery" alongside the default A–Z view -->
<next-organization-directory browse-group-type-id="1" group-noun-plural="Deaneries"></next-organization-directory>

<!-- Point results at your own site's detail page -->
<next-organization-directory detail-page-url-template="/find-a-parish/{congregationId}"></next-organization-directory>

<!-- Relabel for a non-parish directory -->
<next-organization-directory
  page-title="Find a School"
  noun-singular="School"
  noun-plural="Schools"
  location-category-ids="9"
></next-organization-directory>

<!-- Gate the whole directory behind sign-in (needs next-user-menu on the page too) -->
<next-user-menu></next-user-menu>
<next-organization-directory require-sign-in="true"></next-organization-directory>`,
  },
  {
    slug: "organization-detail",
    tag: "next-organization-detail",
    title: "Organization Detail",
    description: "Detail page for a single organization from the directory — photo, address, pastor, and Mass schedule.",
    category: "Public",
    // See the note on the Organization Directory entry above — same reason.
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: {},
    events: ["organizationDetailLoaded", "organizationDetailError"],
    controls: [
      {
        name: "requireSignIn", label: "Require Sign-in", type: "select", attribute: "require-sign-in",
        options: [
          { label: "No (public, default)", value: "false" },
          { label: "Yes (gate behind sign-in)", value: "true" },
        ],
        defaultValue: "false",
      },
      { name: "directoryPage", label: "Directory Page", type: "text", attribute: "directory-page", placeholder: "/organization-directory" },
      { name: "backLabel", label: "Back Link Label", type: "text", attribute: "back-label", placeholder: "e.g. ← All Parishes" },
      { name: "idParam", label: "URL ID Parameter", type: "text", attribute: "id-param", placeholder: "id" },
      { name: "massEventTypeId", label: "Mass Event Type ID", type: "number", attribute: "mass-event-type-id", placeholder: "e.g. 13 (optional)" },
    ],
    implementationCode: `<!-- Reads the organization's ID from ?id= in this page's own URL -->
<next-organization-detail></next-organization-detail>

<!-- Show a weekly Mass schedule section (omit for organizations that aren't parishes) -->
<next-organization-detail mass-event-type-id="13"></next-organization-detail>

<!-- Custom back link and a different query-string parameter name -->
<next-organization-detail
  directory-page="/find-a-parish"
  back-label="← All Parishes"
  id-param="parishId"
></next-organization-detail>

<!-- Gate this page behind sign-in too, matching a gated directory -->
<next-user-menu></next-user-menu>
<next-organization-detail require-sign-in="true"></next-organization-detail>`,
  },
  {
    slug: "personnel-directory",
    tag: "next-personnel-directory",
    title: "Personnel Directory",
    description: "Searchable directory of clergy, staff, and religious — photo, role, location, phone, and email.",
    category: "Public",
    // See the note on the Organization Directory entry above — same reason
    // (require-sign-in below needs next-user-menu on the page to preview).
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: {},
    events: ["personnelDirectoryError"],
    controls: [
      {
        name: "requireSignIn", label: "Require Sign-in", type: "select", attribute: "require-sign-in",
        options: [
          { label: "No (public, default)", value: "false" },
          { label: "Yes (gate behind sign-in)", value: "true" },
        ],
        defaultValue: "false",
      },
      { name: "personnelCategoryIds", label: "Personnel Category IDs", type: "text", attribute: "personnel-category-ids", placeholder: "e.g. 2,4 (Clergy, Staff)" },
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 1,2,4" },
      {
        name: "phoneSource", label: "Phone Source", type: "select", attribute: "phone-source",
        options: [
          { label: "Company Phone", value: "1" },
          { label: "Location Phone", value: "2" },
          { label: "Mobile Phone", value: "3" },
        ],
        defaultValue: "1",
      },
      { name: "organizationDetailUrlTemplate", label: "Organization Detail URL Template", type: "text", attribute: "organization-detail-url-template", placeholder: "/organization-detail?id={congregationId}" },
      { name: "pageTitle", label: "Page Title", type: "text", attribute: "page-title", placeholder: "e.g. Diocesan Staff Directory" },
    ],
    implementationCode: `<next-personnel-directory></next-personnel-directory>

<!-- Only clergy and staff -->
<next-personnel-directory personnel-category-ids="2,4"></next-personnel-directory>

<!-- Prefer each person's mobile number, with no fallback to other phone fields -->
<next-personnel-directory phone-source="3" phone-strict-source="true"></next-personnel-directory>

<!-- Prefer a diocesan alternate email over each person's personal Contact email -->
<next-personnel-directory alternate-email-type-id="1"></next-personnel-directory>

<!-- Link each person's location to your Organization Detail page -->
<next-personnel-directory organization-detail-url-template="/find-a-parish/{congregationId}"></next-personnel-directory>

<!-- Require sign-in to view staff contact details -->
<next-user-menu></next-user-menu>
<next-personnel-directory require-sign-in="true"></next-personnel-directory>`,
  },
  {
    slug: "space-availability",
    tag: "next-space-availability",
    title: "Space Availability",
    description: "Find open rooms by congregation, building, and date range — and optionally request a reservation.",
    category: "Public",
    // See the note on the Organization Directory entry above — same reason
    // (require-sign-in below needs next-user-menu on the page to preview).
    needsUserMenu: true,
    needsMpWidgets: false,
    attributes: { "event-type-id": "11" },
    events: ["availabilityChecked", "reservationRequested"],
    controls: [
      {
        name: "requireSignIn", label: "Require Sign-in", type: "select", attribute: "require-sign-in",
        options: [
          { label: "No (public, default)", value: "false" },
          { label: "Yes (gate behind sign-in)", value: "true" },
        ],
        defaultValue: "false",
      },
      { name: "congregationIds", label: "Congregation IDs", type: "text", attribute: "congregation-ids", placeholder: "e.g. 4 (single) or 4,8 (a set)" },
      {
        name: "showDetailedInfo", label: "Show Detailed Info", type: "select", attribute: "show-detailed-info",
        options: [
          { label: "Yes — show event names", value: "true" },
          { label: "No — busy/free only", value: "false" },
        ],
        defaultValue: "true",
      },
      {
        name: "allowRequests", label: "Allow Requests", type: "select", attribute: "allow-requests",
        options: [
          { label: "No (view only, default)", value: "false" },
          { label: "Yes (visitors can request the space)", value: "true" },
        ],
        defaultValue: "false",
      },
      { name: "eventTypeId", label: "Event Type ID", type: "number", attribute: "event-type-id", placeholder: "e.g. 11 (Meeting)" },
      { name: "programId", label: "Program ID", type: "number", attribute: "program-id", placeholder: "e.g. 10 (Facilities)" },
      { name: "visibilityLevelId", label: "Visibility Level ID", type: "number", attribute: "visibility-level-id", placeholder: "e.g. 1 (Private, default)" },
      { name: "defaultContactId", label: "Default Contact ID", type: "number", attribute: "default-contact-id", placeholder: "Used when allow-requests is on and visitors aren't signed in" },
      { name: "notifyEmails", label: "Notify Emails", type: "text", attribute: "notify-emails", placeholder: "e.g. office@parish.org,facilities@parish.org" },
    ],
    implementationCode: `<next-space-availability event-type-id="11" program-id="10"></next-space-availability>

<!-- Restrict to a single congregation -->
<next-space-availability event-type-id="11" program-id="10" congregation-ids="4"></next-space-availability>

<!-- Busy/free only — hide event names -->
<next-space-availability event-type-id="11" program-id="10" show-detailed-info="false"></next-space-availability>

<!-- Allow visitors to request the space, notifying the facilities office -->
<next-space-availability
  event-type-id="11"
  program-id="10"
  allow-requests="true"
  notify-emails="facilities@parish.org"
  default-contact-id="123"
></next-space-availability>

<!-- Require sign-in to view availability at all -->
<next-user-menu></next-user-menu>
<next-space-availability event-type-id="11" program-id="10" require-sign-in="true"></next-space-availability>`,
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
