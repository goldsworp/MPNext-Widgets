# Milestone Tracker (Individual)

**Tag:** `<next-journey-milestones-individual>` · **Category:** Requires sign-in · **Database setup:** see [Database/milestone-tracker/](../Database/milestone-tracker/)

Shows a signed-in parishioner their own progress through a MinistryPlatform Journey — Confirmation, OCIA, marriage preparation, volunteer formation, whatever you're tracking. Completed steps show a green check and the date; each remaining step offers a "Get Started" button straight to its form or event, when one is set up.

## Before adding this widget

This widget reads a mapping table that tells it which form or event completes each milestone at each parish — that has to be set up once, and populated with your Journey's specific milestones, before "Get Started" buttons will appear. See [Database/milestone-tracker/](../Database/milestone-tracker/).

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout):

```html
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
></next-journey-milestones-individual>
```

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `journey-id` | **Required.** Which Journey to show. Find the number on the **Journeys** page in MinistryPlatform. | `journey-id="18"` |
| `group-id` | **Required.** The Group whose current participants are on this Journey — its parish (Congregation) is used to pick the right form/event links. Find the number on the **Groups** page. | `group-id="136"` |
| `page-heading` | The heading shown above the list. Defaults to "My Journey." | `page-heading="My Confirmation Journey"` |
| `form-url-template` | The page on your site that hosts your online forms. `{formId}` is replaced automatically with the specific form's ID. | `form-url-template="/forms?id={formId}"` |
| `event-detail-url-template` | The page on your site that shows event details. `{eventId}` is replaced automatically with the specific event's ID. | `event-detail-url-template="/events?id={eventId}"` |
| `show-all-get-started-buttons` | `true` (default) — a button on every incomplete step that has one. `false` — only the very next incomplete step gets a button, so the parishioner focuses on one thing at a time. | `show-all-get-started-buttons="false"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Point "Get Started" at your own site's form/event pages -->
<next-journey-milestones-individual
  journey-id="18"
  group-id="136"
  form-url-template="/forms?id={formId}"
  event-detail-url-template="/events?id={eventId}"
></next-journey-milestones-individual>
```

## Class names for customcss

Beyond the 7 colors described in [Customizing Widget Colors](custom-styling.md), the main heading (the `page-heading` text) is a plain `<h1>` — target it with a bare `h1 { ... }` rule in your customcss file, which applies consistently whether that file is used only here or shared with classic MinistryPlatform widgets too. The outer card is `.jm-card`, for anything specific to just this widget.

## Notes

- Shows the signed-in parishioner's own progress only — never anyone else's.
- If someone signed in isn't a current participant of the Group you specified, they'll see an empty tracker rather than an error. Confirm they're actually enrolled in the Group in MinistryPlatform if that happens unexpectedly.
- For a household view instead of one person, see [milestone-tracker-family.md](milestone-tracker-family.md) — same settings, different tag.
