# Full Calendar

**Tag:** `<next-full-calendar>` · **Category:** Public · **Database setup:** none

Your parish's events calendar, drawing from whatever you've already approved for the website in MinistryPlatform — publishing an event there is all it takes for it to show up here. Visitors can switch between a card grid, a list, a month view, a week view, and a mini-calendar view, and filter by campus/parish if you have more than one.

## Add it to a page

```html
<next-full-calendar></next-full-calendar>
```

With no settings at all, it shows every approved event across every campus, starting in card view. Everything below is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `view` | Which view opens first: `cards`, `list`, `month`, `week`, or `calendar` (mini-calendar). Visitors can still switch views themselves. | `view="month"` |
| `show-toolbar` | `true` (default) or `false` — hide the view-switcher/navigation bar, if you want a single fixed view with no controls. | `show-toolbar="false"` |
| `congregation-id` | Show only one campus/parish's events. Find the number on the Congregations page in MinistryPlatform. Leave it off to show all campuses. | `congregation-id="1"` |
| `event-detail-url-template` | Send the "Register" button to a page on your own site instead of MinistryPlatform's, when an event has online registration open but no external URL of its own set. `{eventId}` is replaced automatically with the actual event's number. | `event-detail-url-template="/events?id={eventId}"` |
| `campus-label` | Rename "Campus" in the filter dropdown — useful for a diocese where "Parish" is the right word instead. | `campus-label="Parish"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- List view, no toolbar -->
<next-full-calendar view="list" show-toolbar="false"></next-full-calendar>

<!-- Just one campus, starting in month view -->
<next-full-calendar congregation-id="1" view="month"></next-full-calendar>

<!-- Registration links point at your own site -->
<next-full-calendar event-detail-url-template="/events?id={eventId}"></next-full-calendar>

<!-- Diocese with several parishes -->
<next-full-calendar campus-label="Parish"></next-full-calendar>
```

## Notes

- No sign-in required.
- If you have more than eight campuses/parishes, the filter automatically becomes a searchable list instead of showing every option as a button — nothing you need to configure.
