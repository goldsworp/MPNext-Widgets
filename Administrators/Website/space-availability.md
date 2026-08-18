# Space Availability

**Tag:** `<next-space-availability>` · **Category:** Public (requests need [Database setup](../Database/space-availability/README.md)) · **Database setup:** see [Database/space-availability/](../Database/space-availability/README.md)

Helps someone planning a meeting find an open room and a free time — pick a congregation, then a building, then one or more rooms, then a date range, and it shows existing reservations for those rooms so a free slot is obvious. Optionally, visitors can submit a request to book the space themselves, which creates the reservation directly in MinistryPlatform and emails your office.

## Before adding this widget

- See [Database/space-availability/](../Database/space-availability/README.md) first — this widget needs MinistryPlatform permissions that no other widget on this list requires (read access to Buildings and Rooms, and — only if you turn on requests — the ability to create Events and Room Reservations).
- Every **Room** intended to appear needs **Bookable** checked, and belongs to a **Building**, which belongs to a **Location**, which belongs to a **Congregation** — this is how the widget finds "which rooms exist for this parish." A Room with Bookable unchecked never appears, by design (it's how you keep a private office or closet out of the picker without deleting the record).
- Existing reservations for a room come from Events linked to that Room via a **Room Reservation** (MinistryPlatform's own Event_Rooms record) — whatever already shows on your parish's Room Reservations page is exactly what this widget will show.
- If you plan to turn on **Allow Requests**, decide on an **Event Type** and a **Program** those requests should be filed under (see the settings below) — both are required fields on the Event record MinistryPlatform creates, so there's no working default to guess.

## Add it to a page

```html
<next-space-availability></next-space-availability>
```

With no settings, visitors can browse every parish's rooms and check availability, but can't submit a request — that needs `event-type-id`, `program-id`, and `allow-requests` (see below). Everything else is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `congregation-ids` | Which congregation(s) the widget can search. Leave it off to let visitors pick from every parish. One ID skips the congregation picker entirely (single-parish mode); several show a picker limited to that set. Find the numbers on the **Congregations** page. | `congregation-ids="4"` or `congregation-ids="4,8"` |
| `congregation-noun` | The word used for "Congregation" in the picker's label — defaults to **Parish**. Use this if your organization calls them something else (Campus, Site, Location, etc.). | `congregation-noun="Campus"` |
| `page-heading` | The heading shown above the widget. Defaults to "Check Room Availability". | `page-heading="Book a Room"` |
| `show-detailed-info` | Whether results show the actual event name, or just that the room is busy. Set to `false` for a plain busy/free view — useful if event titles shouldn't be visible to the public. | `show-detailed-info="false"` |
| `require-sign-in` | The directory itself never required sign-in by default — set this to `true` if your parish prefers to keep it (like everything else on the site) behind a login wall. Needs [`<next-user-menu>`](user-menu.md) on the same page when turned on. | `require-sign-in="true"` |
| `allow-requests` | Lets a visitor submit a room request instead of just viewing availability. Requires `event-type-id` and `program-id` below. | `allow-requests="true"` |
| `event-type-id` | **Required if `allow-requests` is on.** The Event Type new requests are filed under — find or create one on the **Event Types** page (e.g. "Meeting" or a dedicated "Room Request" type). | `event-type-id="11"` |
| `program-id` | **Required if `allow-requests` is on.** The Program new requests are filed under — find one on the **Programs** page. Programs belong to a single congregation in MinistryPlatform, so if this widget spans multiple parishes, every request still files under this one Program regardless of which parish's room was booked — pick one that makes sense across all of them (a shared "Facilities" program, for instance), or keep the widget scoped to a single congregation with `congregation-ids` if that matters to you. | `program-id="10"` |
| `visibility-level-id` | The Visibility Level MinistryPlatform sets on new request Events — defaults to **1 (Private)**, since these are internal facility bookings, not public calendar entries. Find the numbers on the **Visibility Levels** page if you want something else. | `visibility-level-id="2"` |
| `default-contact-id` | The Contact new requests are attributed to when the visitor isn't signed in (only relevant if `allow-requests` is on and `require-sign-in` is off). Signed-in visitors are always attributed to themselves regardless of this setting. Find the numbers on the **Contacts** page — a front-office or facilities-team contact works well. | `default-contact-id="123"` |
| `notify-emails` | Who gets emailed when a new request comes in. Separate multiple addresses with commas. Leave it off and no one is notified (the request is still created in MinistryPlatform either way). | `notify-emails="facilities@parish.org"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Just one parish, hiding event names -->
<next-space-availability congregation-ids="4" show-detailed-info="false"></next-space-availability>

<!-- Let visitors request the space, notifying the facilities office -->
<next-space-availability
  event-type-id="11"
  program-id="10"
  allow-requests="true"
  notify-emails="facilities@parish.org"
  default-contact-id="123"
></next-space-availability>

<!-- Require sign-in to view availability at all -->
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-space-availability require-sign-in="true"></next-space-availability>
```

## Notes

- The room list has its own search-by-name box and a minimum-capacity filter (both filter as you type) since a single building can have a lot of rooms — there's no separate setting for either. Once a filter narrows the list, a "Select all" link appears to check every matching room in one click.
- If a reservation has setup or cleanup time entered in MinistryPlatform, the widget's displayed times already include it — a meeting from 9–10 AM with 15 minutes of setup shows as busy starting at 8:45 AM, so visitors never accidentally request a time that's technically "free" on paper but not really available.
- A submitted request is re-checked against the room's current bookings on MinistryPlatform's side before it's created — if someone else claims the same slot in the moments between the visitor loading the page and submitting, they'll see a message that the room is no longer available, rather than accidentally double-booking it.
- A request's notification email always comes from the requestor's own name and address (so replying goes straight to them), regardless of what `notify-emails` you've set.
