# Perpetual Adoration Calendar

**Tag:** `<next-perpetual-adoration>` · **Category:** Requires sign-in · **Database setup:** see [Database/perpetual-adoration/](../Database/perpetual-adoration/)

A sign-up calendar for Perpetual Adoration hours. A signed-in parishioner filters to the days and times that suit them and claims one hour or several in a single click — registrations write straight back into MinistryPlatform, no office involvement needed. Open hours show green; hours someone has already committed to show red, with that person's name.

## Before adding this widget

Adoration hours have to already exist as events in MinistryPlatform for parishioners to see and claim. If your parish doesn't already keep a rolling few months of adoration-hour events populated, see [Database/perpetual-adoration/](../Database/perpetual-adoration/) first — that's a database task, not something you set here.

Also find the numeric **Event Type** MinistryPlatform uses for Perpetual Adoration — go to the Event Types page in MinistryPlatform and note its ID (this varies between MinistryPlatform instances, so don't assume it matches another parish's setup). You'll need it for the required `event-type-id` setting below.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout), since claiming an hour requires knowing who's signed in:

```html
<next-user-menu></next-user-menu>
<next-perpetual-adoration event-type-id="14"></next-perpetual-adoration>
```

`event-type-id` is the only required setting. With nothing else set, it shows adoration hours across every parish. Everything below is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `event-type-id` | **Required.** The Event Type that identifies a Perpetual Adoration hour on your MinistryPlatform instance — find it on the **Event Types** page. Getting this wrong shows the wrong events (whatever that ID means on your instance), not an error, so verify it rather than guessing. | `event-type-id="14"` |
| `congregation-ids` | Show only specific parishes' adoration hours. Find the numbers on the **Congregations** page in MinistryPlatform; separate multiple with commas. Leave it off to show all parishes. | `congregation-ids="4,8"` |
| `success-title` | Heading shown after a successful sign-up. | `success-title="You're signed up"` |
| `success-message` | Body text after a successful sign-up. `{count}` is replaced with how many hours were claimed. | `success-message="Thank you for saying yes to {count} hour(s) of adoration."` |
| `fail-title` | Heading shown if something goes wrong. | `fail-title="Registration problem"` |
| `fail-message` | Body text if something goes wrong. `{error}` is replaced with the specific reason. | `fail-message="We couldn't complete that. {error}"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Just two specific parishes -->
<next-perpetual-adoration event-type-id="14" congregation-ids="4,8"></next-perpetual-adoration>

<!-- Reworded confirmation dialog -->
<next-perpetual-adoration
  event-type-id="14"
  success-message="Thank you for saying yes to {count} hour(s) of adoration."
  fail-message="We couldn't complete that. {error}"
></next-perpetual-adoration>
```

## Notes

- Anyone can view the calendar once signed in; claiming an hour is first-come, first-served — two people can't claim the same hour.
- Committed hours show the adorer's name to other signed-in parishioners, so they can see coverage at a glance. There's currently no setting to hide the name — flag this to your developer if your parish would rather not show it.
