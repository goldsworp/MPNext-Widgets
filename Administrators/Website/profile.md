# Profile Editor

**Tag:** `<next-profile>` · **Category:** Requires sign-in · **Database setup:** none

Lets a signed-in parishioner view and update their own name, email, phone, address, and password — self-service, so your office isn't fielding "please update my phone number" emails.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout), since this widget only ever shows the signed-in visitor's own information:

```html
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-profile></next-profile>
```

## Settings

It always shows whoever is currently signed in — no settings control *what* it shows.

| Attribute | What it does | Example |
|---|---|---|
| `page-heading` | The heading shown above the form. Defaults to "My Profile". | `page-heading="Edit My Information"` |
| `customcss` | Override this widget's colors to match your brand — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## Notes

- If a signed-out visitor reaches this page, they'll see a prompt to sign in rather than an error.
