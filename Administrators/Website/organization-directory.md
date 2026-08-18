# Organization Directory

**Tag:** `<next-organization-directory>` · **Category:** Public · **Database setup:** none

A searchable, browsable public directory of the organizations in your diocese — parishes, schools, cemeteries, hospitals, the chancery, or any mix of them. Visitors can search by name, browse alphabetically (or by deanery/region, if you use those), or search by distance from a ZIP code. A map showing every result sits alongside the list at all times; each result also has its own "Map," "Directions," and "Details" links. No sign-in required.

## Before adding this widget

This widget reads directly from records you already maintain in MinistryPlatform — there's nothing to install, but the directory is only as good as this data:

- **Available Online** must be checked "Yes" on a Congregation record for it to appear at all. This is the only on/off switch — nothing else hides or shows an organization.
- Each Congregation needs a **Location** record attached, with a **Location Category** set (Parish, School, Cemetery, Hospital, etc. — see the **Location Categories** page in MinistryPlatform for the full list and their ID numbers). An organization with no Location, or no Category, still appears in an unfiltered directory but won't show up if you narrow the widget to specific categories.
- For an organization to plot on the map (and for "search near me" distance search to work), the Location's **Address** needs latitude/longitude — MinistryPlatform geocodes addresses automatically once they're entered and validated. An address that hasn't been geocoded yet just won't plot or match a distance search — it still appears normally in the list, just without a "Map" or "Directions" link on its card.
- A **logo or photo** shows automatically if one is attached to the Congregation record (the same way you'd attach any file in MinistryPlatform) — no separate upload step here. Without one, the directory shows a simple colored initial instead.
- If you use **deaneries, vicariates, or regions** (MinistryPlatform's Location Groups) and want a "browse by group" option alongside the default A–Z list, find the numeric ID for the group *type* you use (Deanery, Vicariate, etc.) on the **Location Group Types** page.

## Add it to a page

```html
<next-organization-directory></next-organization-directory>
```

With no settings, it shows every organization marked Available Online, across every category. Everything below is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `require-sign-in` | The classic version of this directory never required sign-in, and that's still the default here — but some dioceses prefer to keep it (like everything else on the site) behind a login wall as a matter of policy. Set this to `true` to require it. Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout) when turned on. | `require-sign-in="true"` |
| `location-category-ids` | Show only specific kinds of organization. Find the numbers on the **Location Categories** page; separate multiple with commas. Leave it off to show every category. | `location-category-ids="1,9"` |
| `pinned-category-ids` | Categories that should always show, even outside the search radius when someone searches by distance (e.g. keep "Diocesan Offices" visible regardless of how far away they are). | `pinned-category-ids="5"` |
| `congregation-ids` | Restrict the whole directory to a specific set of organizations, rather than everything Available Online. | `congregation-ids="1,2,4"` |
| `browse-group-type-id` | Adds a "Browse by [group]" toggle alongside the default A–Z list, grouping results by Location Group (e.g. deanery). Find the ID on the **Location Group Types** page. Leave it off to show only the A–Z view. | `browse-group-type-id="1"` |
| `group-noun-plural` | What to call the groups in that toggle. | `group-noun-plural="Deaneries"` |
| `page-title` | Heading shown above the directory. | `page-title="Find a Parish"` |
| `page-intro` | A line of text under the heading. | `page-intro="Serving the Diocese of San Demo since 1889."` |
| `noun-singular` / `noun-plural` | What to call one organization / more than one, throughout the widget's text. | `noun-singular="Parish"` `noun-plural="Parishes"` |
| `detail-page-url-template` | Where each result links to. `{congregationId}` is replaced automatically with the organization's actual ID. Defaults to `/organization-detail?id={congregationId}` — matching [organization-detail.md](organization-detail.md)'s default. | `detail-page-url-template="/find-a-parish/{congregationId}"` |
| `map-style` | Visual style of the map: `light`, `street`, or `terrain`. | `map-style="street"` |
| `map-center` | Where the map centers before any results or search have loaded, as `latitude,longitude`. | `map-center="33.45,-112.07"` |
| `map-zoom` | Initial map zoom level. | `map-zoom="10"` |
| `radius-options` | The distance choices offered in the "search near me" dropdown. | `radius-options="5,10,25,50"` |
| `default-radius` | Which of those is selected by default. | `default-radius="25"` |
| `units` | `mi` (miles) or `km` (kilometers). | `units="km"` |
| `geocode-country` | Two-letter country code used to look up ZIP/postal codes for distance search. | `geocode-country="ca"` |
| `ignore-leading-titles` | When true (the default), "St. Mary" files under M in the A–Z list instead of S. | `ignore-leading-titles="false"` |
| `show-logos` | Show each organization's attached photo/logo. | `show-logos="false"` |
| `logo-fit` | `cover` (fills the frame, may crop) or `contain` (shows the whole image, may letterbox). | `logo-fit="contain"` |
| `show-phone` / `show-description` | Toggle these optional pieces of information on each result. | `show-phone="false"` |
| `page-size` | How many results load at once before a "Show more" button appears. | `page-size="24"` |
| `compact-threshold` | Above this many total organizations, results switch from photo cards to a denser list automatically. | `compact-threshold="60"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Just parishes and schools -->
<next-organization-directory location-category-ids="1,9"></next-organization-directory>

<!-- Add a "Browse by Deanery" option -->
<next-organization-directory browse-group-type-id="1" group-noun-plural="Deaneries"></next-organization-directory>

<!-- A school-only directory with relabeled text -->
<next-organization-directory
  page-title="Find a School"
  noun-singular="School"
  noun-plural="Schools"
  location-category-ids="9"
></next-organization-directory>

<!-- Require sign-in to view the directory at all -->
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-organization-directory require-sign-in="true"></next-organization-directory>
```

## Notes

- Each result has up to three actions: **Map** (locates and highlights that organization's pin), **Directions** (opens Google Maps directions in a new tab), and **Details** (goes to its [Organization Detail](organization-detail.md) page). "Map" and "Directions" only appear for organizations whose address has been geocoded (see above). Hovering over a result (on a pointer-based device) also opens that pin's popup on the map, matching the classic directory's behavior.
- There's no "Give" link on the directory list itself — that only appears on each organization's own [Organization Detail](organization-detail.md) page, so it always points to that specific organization's own giving page rather than a generic one shared across every result.
- Visitors can search by distance either by typing a ZIP/postal code (geocoded via a free public lookup service — no address or personal information is sent anywhere beyond that ZIP code itself) or by clicking "Use my location," which asks their browser's permission to share their device location directly. Either way works the same once a starting point is set.
- The map is drawn with [Leaflet](https://leafletjs.com/) and free OpenStreetMap/CARTO map tiles — there's no map API key to obtain or pay for.
- This widget doesn't require anything from [Database/](../Database/) — it's a direct read of records you already manage day to day in MinistryPlatform.
