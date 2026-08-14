# Profile Editor

**Tag:** `<next-profile>` · **Category:** Requires sign-in · **Database setup:** none

Lets a signed-in parishioner view and update their own name, email, phone, address, and password — self-service, so your office isn't fielding "please update my phone number" emails.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout), since this widget only ever shows the signed-in visitor's own information:

```html
<next-user-menu></next-user-menu>
<next-profile></next-profile>
```

## Settings

No settings — it always shows whoever is currently signed in.

## Notes

- If a signed-out visitor reaches this page, they'll see a prompt to sign in rather than an error.
