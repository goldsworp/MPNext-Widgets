# My Invoices

**Tag:** `<next-my-invoices>` · **Category:** Requires sign-in · **Database setup:** none

Lets a signed-in parishioner view their own invoices and line-item details — for example, tuition, event fees, or other charges billed through MinistryPlatform.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout):

```html
<next-user-menu></next-user-menu>
<next-my-invoices></next-my-invoices>
```

## Settings

No settings — it always shows whoever is currently signed in, and only their own invoices.

## Notes

- If a signed-out visitor reaches this page, they'll see a prompt to sign in rather than an error.
