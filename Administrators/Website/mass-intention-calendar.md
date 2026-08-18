# Mass Intention Calendar

**Tag:** `<next-mass-intention-calendar>` · **Category:** Public · **Database setup:** none

A public calendar of every scheduled Mass, colour-coded so a visitor can see at a glance which ones still need an intention requested (green) versus already have one (red). Clicking an open Mass links straight to your request/payment page. A "Find Next Available Mass" button jumps to the next open date without scrolling.

## Before adding this widget

Find the numeric **Event Type** MinistryPlatform uses for Mass — go to the Event Types page in MinistryPlatform and note its ID (this varies between MinistryPlatform instances, so don't assume it matches another parish's setup). You'll need it for the required `event-type-id` setting below.

## Add it to a page

```html
<next-mass-intention-calendar event-type-id="13"></next-mass-intention-calendar>
```

`event-type-id` is the only required setting. Everything else below is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `event-type-id` | **Required.** The Event Type that identifies a Mass on your MinistryPlatform instance — find it on the **Event Types** page. Getting this wrong shows the wrong events (whatever that ID means on your instance), not an error, so verify it rather than guessing. | `event-type-id="13"` |
| `congregation-ids` | Show only specific parishes' Masses. Find the numbers on the **Congregations** page in MinistryPlatform; separate multiple with commas. Leave it off to show all parishes. | `congregation-ids="4,8"` |
| `event-detail-url-template` | Where the "request an intention" action links to. `{eventId}` is replaced automatically with the actual Mass's event number. | `event-detail-url-template="/masses?id={eventId}"` |
| `search-months-ahead` | How many months ahead "Find Next Available Mass" is willing to search. Defaults to 12. | `search-months-ahead="6"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Just two specific parishes -->
<next-mass-intention-calendar event-type-id="13" congregation-ids="4,8"></next-mass-intention-calendar>

<!-- Requests go to your own site's request page -->
<next-mass-intention-calendar
  event-type-id="13"
  event-detail-url-template="/masses?id={eventId}"
></next-mass-intention-calendar>
```

## Notes

- No sign-in required to view; whatever page `event-detail-url-template` points to handles the actual request/payment.
- A Mass only shows as "needs an intention" or "has one" based on MinistryPlatform's own event registration records — there's nothing to maintain here beyond what your office already tracks for Mass scheduling.
