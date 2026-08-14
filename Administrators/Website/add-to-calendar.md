# Add to Calendar

**Tag:** `<next-add-to-calendar>` · **Category:** Public · **Database setup:** none

A single button that lets a visitor save one specific event to their own calendar — Google, Apple, Outlook, or a downloadable calendar file. Useful next to an event listing, or on a page dedicated to a single event (a parish mission, a big feast day, a fundraiser).

## Add it to a page

```html
<next-add-to-calendar event-id="1234"></next-add-to-calendar>
```

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `event-id` | **Required.** Which MinistryPlatform Event this button is for. Find it by opening the event in MinistryPlatform and reading the number in the address bar (or the Event's own detail page). | `event-id="1234"` |

## Notes

- One tag = one event. To offer this for several events on one page, add one tag per event, each with its own `event-id`.
- No sign-in required — this works for anonymous visitors.
