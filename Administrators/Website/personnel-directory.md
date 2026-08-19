# Personnel Directory

**Tag:** `<next-personnel-directory>` · **Category:** Public · **Database setup:** none

A searchable directory of the people who serve your diocese — clergy, staff, religious, or any mix. Each card shows a photo (or a colored initial if none is on file), their primary role and location, phone and email (as clickable tap-to-call / tap-to-email links), and any other current assignments. Visitors can search by name, role, location, or category as they type; a category filter appears automatically once there's more than one category in the results.

## Before adding this widget

**This widget needs a one-time permission grant.** Unlike most other widgets in this collection, MinistryPlatform's default security roles restrict read access to Personnel records (they hold HR-sensitive information). In MinistryPlatform, go to **Administration → Security Roles**, find the role the widgets' service account belongs to, and grant **Read** access to: `Personnel`, `Personnel_Assignments`, and `Alternate_Emails` (only needed if you use `alternate-email-type-id`). Until this is granted, the widget will show a loading error.

This widget reads directly from records you already maintain in MinistryPlatform — beyond the permission grant above, there's nothing to install, but the directory is only as good as this data:

- A person needs an active **Personnel** record — not past its End Date, and without a Termination Date — to appear at all.
- Their **Personnel Category** drives the category filter and the small chip shown on their card. This is one of MinistryPlatform's built-in **System Lookup** values, the same on every MinistryPlatform instance and not something you customize, so this widget uses a fixed list rather than looking it up: `1` Catechist, `2` Clergy, `3` Religious, `4` Staff, `5` Volunteer, `6` Seminarian.
- Their card's primary role and location come from whichever **Personnel Assignment** is marked **Primary Assignment** (and hasn't ended) — see the **Personnel** record's Assignments section. Any other current assignments show in a shorter list beneath.
- Phone and email come from the person's own **Contact** record (Company Phone, Mobile Phone, Email Address) unless you configure `phone-source` / `alternate-email-type-id` below to prefer something else.
- A **photo** shows automatically if one is attached to the person's Contact record (the same way you'd attach any file in MinistryPlatform) — no separate upload step here.

**Consider carefully whether to require sign-in.** Unlike the Organization Directory, this widget shows individual staff members' personal contact details (phone, email). Some dioceses are comfortable publishing that to anyone; others prefer to keep it behind a login. There's no right answer here — see `require-sign-in` below either way.

## Add it to a page

```html
<next-personnel-directory></next-personnel-directory>
```

With no settings, it shows every active person across every category. Everything below is optional.

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `require-sign-in` | `true` hides the directory until a visitor signs in; `false` (the default) publishes it to anyone. Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout) when turned on. | `require-sign-in="true"` |
| `personnel-category-ids` | Show only specific categories of person, using the fixed IDs listed above (e.g. `2` for Clergy). Separate multiple with commas. Leave it off to show everyone. | `personnel-category-ids="2,4"` |
| `congregation-ids` | Restrict to people assigned to specific parishes/locations (by the Personnel record's own Congregation, not their assignments). | `congregation-ids="1,2,4"` |
| `phone-source` | Which phone number to prefer: `1` Company Phone (default), `2` the primary assignment's Location Phone, or `3` Mobile Phone. | `phone-source="3"` |
| `phone-strict-source` | When true, shows only the exact source chosen above — no number at all if it's blank, rather than trying another field. | `phone-strict-source="true"` |
| `alternate-email-type-id` | Prefer an Alternate Email of this type (e.g. a diocesan-issued address) over the person's own Contact email, when one exists. Find the ID on the **Alternate Email Types** page. Falls back to the Contact email if no alternate is on file. | `alternate-email-type-id="1"` |
| `organization-detail-url-template` | Makes each person's location a link to your [Organization Detail](organization-detail.md) page. `{congregationId}` is replaced automatically. | `organization-detail-url-template="/find-a-parish/{congregationId}"` |
| `page-heading` | Heading shown above the directory. | `page-heading="Diocesan Staff Directory"` |
| `page-intro` | A line of text under the heading. | `page-intro="Reach any parish or chancery office directly."` |
| `show-photos` | Show each person's attached photo. | `show-photos="false"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Examples

```html
<!-- Only clergy and staff -->
<next-personnel-directory personnel-category-ids="2,4"></next-personnel-directory>

<!-- Prefer each person's mobile number, with no fallback -->
<next-personnel-directory phone-source="3" phone-strict-source="true"></next-personnel-directory>

<!-- Link locations to the Organization Detail page -->
<next-personnel-directory organization-detail-url-template="/find-a-parish/{congregationId}"></next-personnel-directory>

<!-- Require sign-in to view staff contact details -->
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-personnel-directory require-sign-in="true"></next-personnel-directory>
```

## Notes

- If someone has more than one current assignment marked "primary" in MinistryPlatform (a data-entry inconsistency, not something this widget can fix), one is shown as their primary card line and the rest fall into the "other assignments" list below it — nothing breaks, but it's worth cleaning up in MinistryPlatform if you notice it.
- This widget doesn't require anything from [Database/](../Database/) — it's a direct read of records you already manage day to day in MinistryPlatform.
