# Milestone Tracker — Database Setup

Both Milestone Tracker widgets (Individual and Family) read two things: MinistryPlatform's standard Journey/Milestone data, which needs no setup, and a small custom table, `Milestone_Forms`, that tells the widget which online form or event completes each milestone at each parish. That table doesn't exist in a stock MinistryPlatform database — the first script below creates it.

Run the three scripts in this folder **in this order**. All three are safe to run more than once.

## 1. create_Milestone_Forms.sql — creates the mapping table

Creates `dbo.Milestone_Forms`. One row in this table means: *"for this parish (Congregation), this Milestone is completed by this Form and/or this Event."* Both the Form and the Event are optional — a row can point to either one, or both (the widget prefers the Event when both are set).

Open it in SSMS, confirm the database dropdown shows your MinistryPlatform database (not `master`), and run it. If the table already exists from a previous run, the script updates it in place rather than failing.

### Grant the widget access to the new table

This step doesn't come from the SQL script — it's a MinistryPlatform permission, and it's specific to how this project's widgets work (unlike the classic MinistryPlatform custom widgets, which called a stored procedure and never needed this).

Without it, the Milestone Tracker widgets will still show a parishioner's own progress, but any milestone that should show a "Get Started" link won't — because the application can't read the mapping table:

1. In MinistryPlatform, go to **Administration → Security Roles**.
2. Open the security role your widget API Client uses (see the [root setup guide](../../README.md), Step 2 — `Administrators` unless you changed it).
3. Find **Milestone_Forms** and grant it **Read** access.

## 2. register_Milestone_Forms_Page.sql — adds the admin page

Registers a **Milestone Forms** page inside MinistryPlatform itself, so a staff member can manage the Form/Event mappings from the same screens they already use — no SQL required for the day-to-day work of maintaining them.

Run the script, then — this part the script can't do for you — grant access to it:

1. **Administration → Security Roles**, open each role that should be able to manage these mappings.
2. Under **Pages**, add **Milestone Forms** — the same section you'd find **Milestones and Journeys** in is a sensible home for it.
3. Grant the rights that role should have (typically full rights, for staff who maintain the journey).

**Defining the page isn't the same as granting access to it.** Until you complete this step for at least one role, the page exists but won't appear in anyone's navigation menu.

### Populate the mappings

Once the page is visible, open **Milestone Forms** and add one row per milestone that's completed online — for each, choose the Congregation (parish), the Milestone, and the Form and/or Event that completes it. This is ordinary MinistryPlatform data entry, not a database task, but it's the step that makes the Tracker's "Get Started" buttons actually appear — nothing shows up until there's a row for a given parish + milestone combination.

**A form used here must have a Program assigned**, or automatic milestone recording (see the next script) will flag it for a staff member instead of recording it. Check this while you're setting up each mapping, not after something fails to record.

## 3. create_Process_FormResponseMilestone.sql — automatic recording

Creates a MinistryPlatform **Process** named *Form Response – Create Milestone*. When a parishioner submits a form that's mapped in `Milestone_Forms`, this Process records their milestone automatically — no staff member has to do it by hand.

Run the script once; there's nothing further to configure. The milestone-recording logic runs inline within the Process step itself, so there's no separate stored procedure involved.

**This depends on the MinistryPlatform Process Manager service actually running on your server.** If milestones stop appearing after a form submission, that service being stopped is the first thing to check — ask whoever manages your MinistryPlatform server. The Milestone Tracker widgets themselves keep working either way; this only affects whether a milestone is recorded *automatically*. A staff member can always record one by hand in MinistryPlatform if needed.

## Using this for a Journey other than Confirmation

Nothing here is specific to any one Journey. The scripts and the `Milestone_Forms` table work for any Journey and its Milestones — OCIA, marriage preparation, volunteer formation, whatever you're tracking. Set up the mappings for a different Journey's milestones the same way, then point a widget at it — see the Journey ID / Group ID settings on the [Website](../../Website/) side.
