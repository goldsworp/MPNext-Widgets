# Milestone Tracker (Family)

**Tag:** `<next-journey-milestones-family>` · **Category:** Requires sign-in · **Database setup:** see [Database/milestone-tracker/](../Database/milestone-tracker/)

The household version of the [Individual Milestone Tracker](milestone-tracker-individual.md) — one section per family member who's a current participant of the Journey's Group, each with their own progress. A parent following a child's Confirmation preparation (and their own, if they're on the same Journey) sees everyone on one page.

## Before adding this widget

Same as the individual version — this widget also reads the form/event mapping table, which needs to be set up and populated once. See [Database/milestone-tracker/](../Database/milestone-tracker/).

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout):

```html
<next-user-menu></next-user-menu>
<next-journey-milestones-family
  journey-id="18"
  group-id="136"
></next-journey-milestones-family>
```

## Settings

Identical to the [Individual Milestone Tracker](milestone-tracker-individual.md#settings) — `journey-id`, `group-id`, `page-heading` (defaults to "Our Journey" here), `form-base-url`, `event-details-page`, and `show-all-get-started-buttons`.

## Notes

- Shows only the signed-in parishioner's **own household** — never another family's information, even though the Group may contain many families.
- A family member with no milestones recorded yet still gets their own section, so parents can see who hasn't started.
