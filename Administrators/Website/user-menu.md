# User Menu

**Tag:** `<next-user-menu>` · **Category:** Authentication · **Database setup:** none

Shows a sign-in link for visitors who aren't signed in, and an avatar with a dropdown menu (profile, sign out, and more) for visitors who are. This is what makes "sign in to see your own information" possible everywhere else in this collection — any widget marked "requires sign-in" needs this one on the same page.

## Add it to a page

Put it somewhere visible and consistent — a header or shared layout is the usual choice, so it appears on every page a parishioner might need to sign in from:

```html
<next-user-menu></next-user-menu>
```

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `post-logout-redirect-uri` | Where a visitor lands after signing out. Leave it off to stay on the same page. | `post-logout-redirect-uri="https://yourchurch.org"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Deep-linking to a specific tab

The account menu this widget opens has several tabs (profile, family, giving, subscriptions, invoices). You can link directly to one from anywhere on your site by adding `#next-tab=<tabname>` to a URL, for example a link that says "Update your giving" pointing at `https://yourchurch.org/account#next-tab=giving`.

## Notes

- This widget needs no `journey-id`, `group-id`, or similar settings — it's the same on every page.
- If the sign-in box itself shows *"Unable to connect. Please check Permitted URLs"*, that's a separate MinistryPlatform-side setting from everything else in this collection — see the [Troubleshooting section of the root setup guide](../README.md#troubleshooting).
