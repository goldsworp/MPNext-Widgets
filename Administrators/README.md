# Administrators — Start Here

This is the entry point for anyone setting up or maintaining these widgets — not developers, just the people who will run a one-time database script, or add a widget to a page on the church website. If you're comfortable with code, the root [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) cover the technical side in more depth. This guide assumes neither.

## Two jobs, maybe two people

Setting this up involves two kinds of work that don't require the same skills or the same access:

- **Database setup** — running a short SQL script against your MinistryPlatform database, and occasionally granting a permission in MinistryPlatform's own admin screens. Needs [SQL Server Management Studio](https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms) (SSMS) access and MinistryPlatform administrator rights. See **[Database/](Database/)**.
- **Website setup** — adding a widget's tag to a page on your parish or diocesan website, and choosing a few settings for it. Needs access to edit pages on your website. Needs no SQL knowledge at all. See **[Website/](Website/)**.

On a small parish, one person might do both. In a diocese, these are often different departments entirely — someone in IT who has database access, and someone in communications who manages the website. Read this page yourself regardless of which job is yours; it's what makes the other one possible.

This document covers the part before either of those: getting the system itself up and running. Do this once, for the whole collection of widgets — not once per widget.

## What this actually is

If you've used the classic MinistryPlatform custom widgets before — a `<div>` tag with a stored procedure and a Liquid template — this works differently, even though it solves the same problem: showing MinistryPlatform data on your website.

Instead of a stored procedure you write and a script you paste onto every page, this is a small, complete website application (built on Next.js, if you're curious) that you deploy once to a free hosting service called [Vercel](https://vercel.com). Once it's deployed, it does two things:

1. It hosts a small script your website loads once, which then lets you drop in any of the widgets — `<next-full-calendar></next-full-calendar>`, for example — as plain HTML tags, no stored procedure required for most of them.
2. It talks to MinistryPlatform on your website's behalf, over a secure connection, so a visitor's browser never talks to MinistryPlatform directly.

A few widgets — the Milestone Tracker, Perpetual Adoration, and Space Availability, so far — do need a short one-time database script, because they read from or write to a custom table that doesn't exist in MinistryPlatform out of the box, or because they let a signed-in parishioner create a record (like claiming an adoration hour or requesting a room). Those scripts, and the notes on when to run them, live in **[Database/](Database/)**.

## What you need before starting

- A **GitHub account** (free) — this is where your copy of the project lives. [Sign up here](https://github.com/signup) if you don't have one.
- A **Vercel account** (free tier is enough to start) — this is what actually runs the application and gives it a web address. [Sign up here](https://vercel.com/signup); signing up "with GitHub" is the easiest option and links the two automatically.
- Someone with **MinistryPlatform administrator access**, to create an API Client (Step 2 below). This is a five-minute task, but it does require an admin login to MinistryPlatform itself.
- Access to add an **HTML block** to a page on your website (for later, once the system is deployed — see [Website/](Website/)).

You do **not** need to install anything on your own computer, know how to write code, or use a command line. Everything below happens in a web browser.

If you do not have a dedicated hosting plan or the required SQL Server skills, reach out to the professional services team for assistance. Normal hourly rates will apply.

## Step 1 — Fork the repository

"Forking" makes your own private copy of the project on GitHub, which you can then deploy and customize without affecting the original.

1. Go to the project's GitHub page (ask whoever pointed you to this guide for the exact link, or search for **MinistryPlatform-Community/MPNext-Widgets**).
2. Click **Fork** in the top-right corner.
3. Leave the settings as they are and click **Create fork**.

You now have your own copy, at `github.com/<your-username>/MPNext-Widgets`. Everything from here on works from your copy, not the original.

## Step 2 — Create a MinistryPlatform API Client

This tells MinistryPlatform to trust the widgets application and lets parishioners sign in through it. Do this before deploying, since the deployment step needs the Client ID and Secret you create here.

1. Sign in to MinistryPlatform as an administrator and go to **Administration → API Clients**.
2. Click to create a new API Client.
3. Give it a **Client ID** (e.g. `MPNextWidgets`) and a **Display Name** — anything memorable.
4. Generate a **Client Secret** and save it somewhere secure (a password manager, not a sticky note) — you'll paste it into Vercel in Step 4, and you won't be able to see it again afterward.
5. Leave the **Authentication Flow** at its default (it should include Authorization Code and Client Credentials).
6. Leave **Redirect URIs** and **Post-Logout Redirect URIs** blank for now — you don't have a web address yet. You'll come back and fill these in during Step 5, right after deploying.

## Step 3 — Import the project into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and sign in.
2. Choose **Import Git Repository**, and select the fork you created in Step 1 (`<your-username>/MPNext-Widgets`).
3. Vercel will detect it as a Next.js project automatically. Don't click Deploy yet — first open **Environment Variables** and add the settings in the next step.

## Step 4 — Set the environment variables

These are the settings the application needs to run — think of them as the configuration panel for the whole system. In Vercel's **Environment Variables** section (still on the import screen, or later under **Project → Settings → Environment Variables**), add each of these as a Name/Value pair.

| Name | Value |
|---|---|
| `MINISTRY_PLATFORM_BASE_URL` | Your MinistryPlatform address, ending in `/ministryplatformapi` — e.g. `https://yourchurch.ministryplatform.com/ministryplatformapi` |
| `MINISTRY_PLATFORM_CLIENT_ID` | The Client ID from Step 2 |
| `MINISTRY_PLATFORM_CLIENT_SECRET` | The Client Secret from Step 2 |
| `OIDC_CLIENT_ID` | Same as `MINISTRY_PLATFORM_CLIENT_ID`, unless someone set up a separate login-only client |
| `OIDC_CLIENT_SECRET` | Same as `MINISTRY_PLATFORM_CLIENT_SECRET`, unless separate |
| `BETTER_AUTH_URL` | Leave blank for now — you'll fill this in after the first deploy, once Vercel gives you a web address |
| `BETTER_AUTH_SECRET` | A random string, at least 32 characters. See below. |
| `EMBED_JWT_SECRET` | A **different** random string, at least 32 characters. See below. |
| `EMBED_ALLOWED_ORIGINS` | Leave blank for now — this is the address of the church *website* the widgets will be embedded on, which you'll add once you know it. See [Website/](Website/). |
| `NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL` | Your MinistryPlatform address ending in `/ministryplatformapi/files` — e.g. `https://yourchurch.ministryplatform.com/ministryplatformapi/files` |
| `NEXT_PUBLIC_APP_NAME` | Whatever you'd like the app to be called internally — e.g. `Christ the King Widgets` |

**Generating the two secret values.** `BETTER_AUTH_SECRET` and `EMBED_JWT_SECRET` just need to be long, random, and different from each other — they're not passwords you'll ever type in. The simplest way: use a password manager's "generate password" feature set to 40+ characters, or a site like [1Password's generator](https://1password.com/password-generator/) (uncheck "memorable," you want gibberish, not a phrase). Do this twice, once for each.

Every other setting in [`.env.example`](../.env.example) is optional and can be left blank for a first deployment.

## Step 5 — Deploy, then complete the loop

1. Click **Deploy**. Vercel builds and hosts the application — this takes a couple of minutes.
2. Once it finishes, Vercel shows you a web address, something like `https://mpnext-widgets-yourname.vercel.app`. This is your permanent web address (you can add a custom domain later, but this works immediately).
3. Go back into **Project → Settings → Environment Variables** and set `BETTER_AUTH_URL` to that address exactly (e.g. `https://mpnext-widgets-yourname.vercel.app`, no trailing slash).
4. Go back to MinistryPlatform's **API Clients** page, open the client you created in Step 2, and fill in:
   - **Redirect URI**: `https://<your-vercel-address>/api/auth/oauth2/callback/ministry-platform`
   - **Post-Logout Redirect URI**: `https://<your-vercel-address>`
5. Back in Vercel, go to the **Deployments** tab and choose **Redeploy** on the latest deployment, so it picks up the `BETTER_AUTH_URL` change.

## Step 6 — Test it

1. Visit your Vercel address in a browser.
2. Click **Sign In**. You should be sent to MinistryPlatform's own login page, then back to the widgets site once you sign in.
3. If sign-in works, the core system is live. From here:
   - If any widget needs a one-time database script first, an administrator with SSMS access should read **[Database/](Database/)**.
   - Whoever manages the website should read **[Website/](Website/)** to add widgets to actual pages.

## Troubleshooting

**"Redirect URI mismatch" when signing in.** The address in MinistryPlatform's API Client settings (Step 5) must match your Vercel address *exactly* — same `https://`, no trailing slash, no typos. Double-check both sides.

**Sign-in redirects back to the widgets site but shows you signed out again.** The Post-Logout Redirect URI (Step 5) is usually the cause — MinistryPlatform requires it even though it sounds like it's only about signing out.

**A widget shows a connection or permission error.** Most often this means the website where the widget is embedded isn't in `EMBED_ALLOWED_ORIGINS` yet — see [Website/README.md](Website/README.md). This is a different setting from the sign-in redirect URIs above; sign-in can work perfectly while a specific widget still fails for this reason.

**The `next-user-menu` sign-in box itself shows "Unable to connect. Please check Permitted URLs."** This is a separate, MinistryPlatform-side allowlist (not `EMBED_ALLOWED_ORIGINS`) that controls MinistryPlatform's own login widget. Someone with access to your MinistryPlatform web server needs to add your website's address to `customer.config` and recycle the Widgets application pool — see the [MinistryPlatform Widget Origins section](../README.md#ministryplatform-widget-origins-local-dev) of the developer README for the exact steps, or ask your MinistryPlatform hosting provider to do it.

**I changed an environment variable in Vercel and nothing happened.** Environment variable changes need a **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) to take effect — just saving the variable isn't enough.

**A widget needs a "Group ID" or "Journey ID" or similar number, and I don't know what to put.** These refer to records inside MinistryPlatform itself (a specific Group, a specific Journey, and so on) — see the specific widget's page under [Website/](Website/) for where to find that number in MinistryPlatform.

## Where things live from here

- **[Database/](Database/)** — one-time SQL scripts and MinistryPlatform permission steps, organized by widget. For the person with SSMS and MinistryPlatform admin access.
- **[Website/](Website/)** — what each widget does, its settings explained in plain language, and the HTML to paste onto a page. For the person who manages website content.
