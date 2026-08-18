# Family Faith Formation

**Tag:** `<next-faith-formation>` · **Category:** Requires sign-in · **Database setup:** none

Shows a signed-in parishioner every household member enrolled in a Faith Formation group — current and past groups, the leader's contact details, and meeting/attendance history. A parent can see their whole family's involvement — every child's class, without asking the office.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout):

```html
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-faith-formation ministry-id="13"></next-faith-formation>
```

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `ministry-id` | **Required.** Which Ministry's groups to show — find the number on the **Ministries** page in MinistryPlatform (Faith Formation is usually its own Ministry). | `ministry-id="13"` |
| `show-leader-email` | `true` (default) or `false` — show the group leader's email address. | `show-leader-email="false"` |
| `show-leader-mobile-phone` | `true` (default) or `false` — show the group leader's mobile number. | `show-leader-mobile-phone="false"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Hide the leader's contact details -->
<next-faith-formation
  ministry-id="13"
  show-leader-email="false"
  show-leader-mobile-phone="false"
></next-faith-formation>
```

## Notes

- Shows the signed-in parishioner's **own household** only — never another family's information.
- Only shows groups under the Ministry you specify; a parish running Faith Formation as more than one Ministry needs one widget tag per Ministry, on separate pages or sections.
