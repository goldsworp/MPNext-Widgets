# Perpetual Adoration Calendar — Database Setup

The Perpetual Adoration Calendar widget itself needs nothing from you — it reads and writes MinistryPlatform's standard `Events` and `Event_Participants` tables, which the application already has access to. The two scripts in this folder aren't used by the widget at all; they're for **keeping the calendar stocked with future adoration hours**, and **cleaning up old ones**. Both are ongoing maintenance, not one-time setup — read this whole page before running either.

## What the widget actually needs from you

Nothing to install. It just needs adoration hours to already exist as **Events** in MinistryPlatform — approved, not cancelled, using your parish's "Perpetual Adoration" Event Type — for a given date range. That's exactly what `custom_PerpetualAdoration_GenerateSlots.sql` automates below, so you don't have to create dozens of hourly events by hand every month.

## custom_PerpetualAdoration_GenerateSlots.sql

Creates a stored procedure, `dbo.custom_PerpetualAdoration_GenerateSlots`, that fills in any missing adoration-hour events between today and a horizon you choose — for example, "always keep the next 6 months populated." Run it once to create the procedure; then either run it by hand periodically, or (better) put it on a recurring schedule so no one has to remember.

**It never creates duplicates.** Each run only adds slots that don't already exist, so it's safe to run as often as you like — daily, even. If a scheduled run is ever missed, the next one catches up automatically.

### Running it

Open the script in SSMS, confirm you're pointed at your MinistryPlatform database (not `master`), and execute it. This creates the procedure but doesn't run it yet.

Then call the procedure with your own parish's details:

```sql
EXEC dbo.custom_PerpetualAdoration_GenerateSlots
    @MonthsAhead    = 6,   -- keep this many months of future slots populated
    @SlotMinutes    = 60,  -- length of each slot, in minutes
    @CongregationID = 1,   -- your parish, from the Congregations page in MinistryPlatform
    @LocationID     = 1,   -- the Location the adoration chapel belongs to
    @RoomID         = 1,   -- the specific Room (e.g. the Adoration Chapel)
    @ProgramID      = 1,   -- the Program these events should be filed under
    @PrimaryContact = 2;   -- the Contact_ID listed as the event's primary contact
```

You'll need to look up the actual `CongregationID`, `LocationID`, `RoomID`, `ProgramID`, and `PrimaryContact` values for your own MinistryPlatform instance — the numbers above are just placeholders. Ask whoever manages your MinistryPlatform data if you're not sure where to find them (Locations, Rooms, and Programs each have their own page in MinistryPlatform).

### Putting it on a schedule

Running this by hand every month works, but it's easy to forget. The bottom of the script includes a SQL Server Agent job template — a standing schedule so it just runs itself, monthly (on the 1st) or daily for extra safety.

If your MinistryPlatform database is hosted for you (MinistryPlatform Cloud) rather than on a server you manage, you likely don't have SQL Server Agent access yourself. Ask MinistryPlatform's professional services team to set the schedule up on your behalf — mention you're scheduling `custom_PerpetualAdoration_GenerateSlots` to run monthly.

## custom_PerpetualAdoration_PurgeOldSlots.sql

Old adoration events don't clutter anything — they're not on the public calendar, and the widget already hides past hours from parishioners. **Most parishes never need to run this at all.** It exists only for reclaiming space if your `Events` table grows large enough to matter.

This script deletes records, so it has two safety features, and you should not skip either:

- **Preview mode by default.** Running it without changes only reports how many slots *would* be deleted — nothing is actually removed until you explicitly say so.
- **Filled slots are kept by default.** A slot someone actually signed up for is preserved (that participation history is usually worth keeping); only hours that were *never* claimed by an adorer are ever candidates for deletion.

```sql
-- Step 1: preview only — reports a count, deletes nothing
EXEC dbo.custom_PerpetualAdoration_PurgeOldSlots
    @OlderThanMonths = 24,
    @CongregationID  = 1;

-- Step 2: after reviewing the preview, actually delete
EXEC dbo.custom_PerpetualAdoration_PurgeOldSlots
    @OlderThanMonths = 24,
    @CongregationID  = 1,
    @Preview         = 0;
```

Always run Step 1 first and read the result before ever passing `@Preview = 0`.

**If you'd rather keep every record but just hide old slots**, you don't need this script at all — set `Cancelled = 1` on the old events directly in MinistryPlatform. The widget already treats cancelled events as hidden.
