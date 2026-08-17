# Database Setup

This section is for whoever has **SQL Server Management Studio (SSMS)** access to your MinistryPlatform database, and administrator access to MinistryPlatform itself. If that's not you, hand this folder to whoever it is — nothing here needs a developer.

If you do not have a dedicated hosting plan or the required SQL Server skills, reach out to the professional services team for assistance. Normal hourly rates will apply.

Most widgets in this collection need nothing from you at all: they read MinistryPlatform data over the same secure connection the rest of the application uses, and there's no script to run. A few widgets are different, because they either need a small custom table that doesn't exist in MinistryPlatform out of the box, or they let a signed-in parishioner create a record (like claiming a Perpetual Adoration hour) rather than just viewing one. Those widgets each have their own subfolder here:

- **[milestone-tracker/](milestone-tracker/)** — for the Individual and Family Milestone Tracker widgets.
- **[perpetual-adoration/](perpetual-adoration/)** — for the Perpetual Adoration Calendar widget.
- **[space-availability/](space-availability/)** — for the Space Availability widget (permission grant only, no SQL to run).

Each subfolder has its own README explaining exactly what to run and when. This page covers what's common to all of them.

## What you'll be doing

Two kinds of task show up repeatedly:

1. **Running a SQL script in SSMS.** Every script here is safe to run more than once — they use `CREATE OR ALTER` and check `IF NOT EXISTS` before inserting, so re-running one to apply a later update won't create duplicates or break anything. Always confirm the database dropdown in SSMS shows your MinistryPlatform database (not `master`) before running anything.

2. **Granting a permission inside MinistryPlatform's own admin screens** (Administration → Security Roles). This is *not* something a SQL script can do for you, and it's easy to miss because the classic MinistryPlatform custom widgets never needed it.

## Why the permission step exists

If you've set up classic MinistryPlatform custom widgets before, you're used to a script linking a stored procedure to a security role (in `dp_Role_API_Procedures`) and that being the whole story — the procedure runs under its own permissions once it's registered.

These widgets work differently: instead of calling a stored procedure, the application reads and writes MinistryPlatform tables directly through the REST API, using its own API Client's identity. That means whenever a widget needs a table that didn't previously need API-level access — a brand-new table like `Milestone_Forms`, for instance — **that API Client's security role needs to be granted Read (or Read/Write) access to that specific table**, in addition to whatever the SQL script itself sets up.

If a widget's page shows an error mentioning "does not have access to the table," this is almost always the cause. The fix, every time:

1. In MinistryPlatform, go to **Administration → Security Roles**.
2. Open the role your widget API Client uses (the one you created in [the root setup guide](../README.md), Step 2 — `Administrators` unless you changed it).
3. Find the table named in the error message and grant it **Read** access (or **Read/Write**, if the widget's own README below says it needs to create records).

Each widget's README in this folder says up front which tables it needs this for, so you shouldn't need to wait for an error to find out.

## A note on caution

These scripts create tables, register database objects, and — in Perpetual Adoration's case — one of them can *delete* old records. Read a script before running it if you're not sure what it does; each one has a comment block at the top explaining its purpose, and the ones that delete anything default to a preview-only mode that reports what *would* happen without changing anything, until you explicitly turn deletion on.
