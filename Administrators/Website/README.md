# Website Setup

This section is for whoever adds pages and HTML blocks to your parish or diocesan website. No database access, no SQL, and no coding beyond pasting a snippet of HTML onto a page. If a widget needs something set up in MinistryPlatform first (a new table, a permission grant), its page below says so and points to [Database/](../Database/) — but you won't be doing that part yourself.

Before anything here, make sure whoever handled [the root setup guide](../README.md) has already deployed the application and given you its web address (something like `https://mpnext-widgets-yourname.vercel.app`). Everything below assumes that's done.

## One-time setup: load the script

Every widget on your site shares one small script. Add this **once**, somewhere it loads on every page — most website builders have a "Head HTML" or "Body End HTML" setting for exactly this, so you don't have to paste it onto each individual page:

```html
<script type="module" src="https://<your-app-address>/embed-sdk/next-embed.js"></script>
```

Replace `<your-app-address>` with the Vercel address from the root setup guide. Once this is in place, any widget tag anywhere on the site will work — you never touch this again unless the address changes.

**Tell whoever did the root setup which website address(es) you're adding widgets to.** They'll need to add each one to `EMBED_ALLOWED_ORIGINS` in Vercel — this is a security check that stops random other websites from using your widgets. If a widget shows a connection error even though the page looks right, this is the first thing to check.

## If any widget requires sign-in

A few widgets — anything marked **requires sign-in** below — only work for a parishioner who's signed in to MinistryPlatform through your site. Those need MinistryPlatform's own login element on the same page (or a shared page layout), in addition to the widget itself:

```html
<next-user-menu></next-user-menu>
```

See [user-menu.md](user-menu.md) for what this looks like and what it does. Add it once per page that hosts a sign-in-required widget — the demo pages for those widgets on this list all show it alongside the widget for exactly this reason.

## How a widget tag works

Every widget is a single HTML tag, and its **attributes** are its settings — there's no separate configuration screen. For example:

```html
<next-full-calendar congregation-id="4" view="month"></next-full-calendar>
```

`congregation-id` and `view` here are attributes — this one shows only Congregation 4's events, in month view. Each widget's page below lists its own attributes, what they do, and where in MinistryPlatform to find any ID number they need.

A few things that are true for every widget:

- **Attributes are optional unless a widget's page says otherwise.** Most widgets work with no attributes at all, using sensible defaults.
- **You can put more than one of the same widget on a page**, each configured differently — for instance, two `<next-mass-intention-calendar>` tags, one per congregation-ids value.
- **Changing a setting later just means editing the attribute's value** in your page's HTML block and republishing — nothing to redeploy, nothing to ask a developer for.

## Finding the ID numbers a widget asks for

Several widgets ask for a numeric ID — an Event ID, Congregation ID, Journey ID, Group ID, or Ministry ID. These all refer to specific records already inside MinistryPlatform. Each widget's page tells you exactly which MinistryPlatform page to find that number on (for example, "the Congregations page" or "the Groups page") — you're not creating these IDs, just looking up ones that already exist.

## Previewing a widget before you publish it

The deployed application includes a **demo gallery** — visit `https://<your-app-address>/demo` and sign in. It lets you try each widget with different settings and see it render live, before you ever touch your actual website's page editor. This is worth doing first, especially the first time you configure a new widget.

## Matching widget colors to your brand

Every widget below accepts a `customcss` attribute — the same idea as the `customcss` setting on MinistryPlatform's own classic widgets — to override its colors without a developer. See [custom-styling.md](custom-styling.md).

## Every widget

### Authentication
- **[user-menu.md](user-menu.md)** — sign-in/sign-out, required alongside any widget below marked "requires sign-in"

### Public (no sign-in required)
- **[add-to-calendar.md](add-to-calendar.md)** — "Add to Calendar" button for a single event
- **[full-calendar.md](full-calendar.md)** — parish events calendar
- **[mass-intention-calendar.md](mass-intention-calendar.md)** — Mass schedule with intention availability
- **[perpetual-adoration.md](perpetual-adoration.md)** *(requires sign-in to claim an hour, viewable by anyone)*
- **[organization-directory.md](organization-directory.md)** — searchable directory of parishes, schools, and other locations
- **[organization-detail.md](organization-detail.md)** — the detail page each directory result links to
- **[personnel-directory.md](personnel-directory.md)** — searchable directory of clergy, staff, and religious
- **[space-availability.md](space-availability.md)** — find an open room and time, and optionally request one

### Requires sign-in
- **[profile.md](profile.md)** — edit your own profile
- **[my-invoices.md](my-invoices.md)** — view your own invoices
- **[faith-formation.md](faith-formation.md)** — your household's Faith Formation involvement
- **[perpetual-adoration.md](perpetual-adoration.md)** — claim an open adoration hour
- **[milestone-tracker-individual.md](milestone-tracker-individual.md)** — your own progress through a Journey
- **[milestone-tracker-family.md](milestone-tracker-family.md)** — your household's progress through a Journey

## Troubleshooting

**A widget shows nothing at all, or a spinner that never resolves.** Open the browser's developer console (F12) and look for an error. Most often it's a missing website address in `EMBED_ALLOWED_ORIGINS` — ask whoever manages the deployment to add your site's address there. It only needs doing once per website domain, not per widget.

**A widget shows "Please sign in," even though I'm already signed in elsewhere on the site.** That widget needs `<next-user-menu>` on the *same page* (or the shared layout the page uses) — see "If any widget requires sign-in" above.

**A widget shows a permission or "does not have access" error.** This is a MinistryPlatform-side setup step, not a website problem — see [Database/](../Database/) for the specific widget.

**I don't know what number to put in an attribute like `group-id` or `journey-id`.** See the individual widget's page — each one says exactly where in MinistryPlatform to find that value.
