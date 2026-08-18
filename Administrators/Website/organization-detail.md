# Organization Detail

**Tag:** `<next-organization-detail>` · **Category:** Public · **Database setup:** none

The page each [Organization Directory](organization-directory.md) result links to — a single organization's photo, address, phone, pastor, directions, and (for parishes) weekly Mass schedule. No sign-in required.

## Before adding this widget

This is a companion to [organization-directory.md](organization-directory.md) — set that widget up first. This widget reads which organization to show from its own page's web address (`?id=123`), so it needs to live on its **own page**, separate from the directory itself, with nothing else required beyond the tag.

If you want the weekly Mass schedule section to show real Mass times, find your Mass **Event Type** ID the same way described in [mass-intention-calendar.md](mass-intention-calendar.md#before-adding-this-widget) and supply it via `mass-event-type-id` below. Leave it off for organizations that aren't parishes (schools, cemeteries, offices) — the section still appears, it just says no Mass times are published, which is the correct and expected result for those.

## Add it to a page

```html
<next-organization-detail></next-organization-detail>
```

That's the entire tag — no attributes are required. Make sure the [Organization Directory](organization-directory.md) widget's `detail-page-url-template` points at whatever web address this tag lives on (it defaults to `/organization-detail?id={congregationId}`, which matches this widget's own default `id` expectation with no changes needed on either side).

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `require-sign-in` | If you set this to `true` on the [Organization Directory](organization-directory.md) widget, set it here too so this page matches — otherwise a visitor could reach an individual organization's page directly without signing in. Needs [`<next-user-menu>`](user-menu.md) on the same page when turned on. | `require-sign-in="true"` |
| `mass-event-type-id` | Shows a weekly Mass schedule section, built from the organization's upcoming scheduled Masses. Find the ID the same way as [Mass Intention Calendar](mass-intention-calendar.md). Leave it off for non-parish organizations — the section still shows, just empty. | `mass-event-type-id="13"` |
| `directory-page` | Where the back link at the top of the page goes. | `directory-page="/find-a-parish"` |
| `back-label` | Text for that back link. | `back-label="← All Parishes"` |
| `id-param` | The web address parameter this widget reads the organization's ID from. Only change this if it needs to match something other than the directory widget's default. | `id-param="parishId"` |
| `hero-height` / `hero-height-mobile` | Height of the photo band at the top of the page, desktop and mobile. | `hero-height="320px"` |
| `hero-overlay` | How much the photo band is darkened behind its title text, from `0` (none) to `1` (fully dark), so the name stays readable over any photo. | `hero-overlay="0.5"` |
| `map-style` | Visual style of the small "directions" map: `light`, `street`, or `terrain`. | `map-style="street"` |
| `map-zoom` | Zoom level of that map. | `map-zoom="15"` |
| `show-phone` / `show-description` / `show-giving-link` | Toggle these optional pieces of information. | `show-giving-link="false"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Show the weekly Mass schedule -->
<next-organization-detail mass-event-type-id="13"></next-organization-detail>

<!-- Custom back link, matching a relabeled directory -->
<next-organization-detail
  directory-page="/find-a-parish"
  back-label="← All Parishes"
></next-organization-detail>
```

## Notes

- If no photo is attached to the organization's record, the page shows a plain colored panel with the organization's first initial instead — nothing to configure, it's automatic.
- If the organization's address hasn't been geocoded yet (see [organization-directory.md](organization-directory.md#before-adding-this-widget)), the map and "Get Directions" link are simply left out; everything else on the page still shows.
- This widget doesn't require anything from [Database/](../Database/) — it's a direct read of records you already manage day to day in MinistryPlatform.
