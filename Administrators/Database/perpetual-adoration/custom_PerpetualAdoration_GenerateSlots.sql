/* ============================================================
   custom_PerpetualAdoration_GenerateSlots
   ------------------------------------------------------------
   Keeps a rolling window of Perpetual Adoration slots populated.

   Instead of "create the month six months out", this ensures the
   next @MonthsAhead months are ALWAYS fully populated. Each run
   regenerates the window from today forward and inserts only the
   slots that don't exist yet, so it is:
     - self-seeding : the first run creates the whole window
     - self-healing : a missed run is caught up on the next run
     - safe to re-run: existing slots are skipped (no duplicates)

   Run it monthly (1st of the month) or even daily - overlap is a
   no-op. See the SQL Server Agent job template at the bottom.

   It also reserves the room for each new event and keeps them in
   the Perpetual Adoration event series (reusing an existing series
   if one is present).

   Events are created PRIVATE (Visibility = 1, not web-approved) so
   they stay off the public events calendar.
   ============================================================ */
GO
CREATE OR ALTER PROCEDURE dbo.custom_PerpetualAdoration_GenerateSlots
    -- ============================================================
    --  *** SETTINGS - EDIT THESE DEFAULTS ONCE ***
    --  These parameter defaults are the ONLY place you configure
    --  this script. The manual seed run and the scheduled Agent job
    --  below both call the procedure with no arguments, so they
    --  automatically use whatever you set here.
    -- ============================================================
    @MonthsAhead     INT = 6,    -- keep this many months populated ahead of today
    @SlotMinutes     INT = 60,   -- 60 = one-hour slots; 30 = half-hour slots
    @EventTypeID     INT = 14,   -- Perpetual Adoration
    @CongregationID  INT = 1,    -- CHANGE to the correct congregation / parish
    @LocationID      INT = 1,    -- CHANGE to the correct location
    @RoomID          INT = 1,    -- CHANGE to the adoration chapel room
    @ProgramID       INT = 1,    -- CHANGE to an appropriate program
    @PrimaryContact  INT = 2,    -- 2 = the Default Contact record
    @DomainID        INT = 1
AS
BEGIN
    SET NOCOUNT ON;

    -- Rolling window: from the start of today through @MonthsAhead months out.
    DECLARE @StartDate DATETIME = CAST(GETDATE() AS DATE);
    DECLARE @EndDate   DATETIME = DATEADD(MONTH, @MonthsAhead, @StartDate);

    DECLARE @Description NVARCHAR(500) =
        'Perpetual adoration of the Blessed Sacrament. Come and commit your time to prayer.';

    -- How many slots fit in the window at the chosen granularity.
    DECLARE @SlotCount INT = DATEDIFF(MINUTE, @StartDate, @EndDate) / @SlotMinutes;

    ------------------------------------------------------------------
    -- 1. Create any missing events in the window
    ------------------------------------------------------------------
    ;WITH Numbers AS (
        SELECT TOP (@SlotCount) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS Num
        FROM master.dbo.spt_values a
        CROSS JOIN master.dbo.spt_values b
    ),
    Slots AS (
        SELECT
            DATEADD(MINUTE, Num * @SlotMinutes, @StartDate)       AS StartDateTime,
            DATEADD(MINUTE, (Num + 1) * @SlotMinutes, @StartDate) AS EndDateTime,
            FORMAT(DATEADD(MINUTE, Num * @SlotMinutes, @StartDate),
                   CASE WHEN @SlotMinutes = 60 THEN 'ddd h:00 tt' ELSE 'ddd h:mm tt' END) AS TimeSlot
        FROM Numbers
    )
    INSERT INTO Events (
        Event_Title, Event_Type_ID, Congregation_ID, Location_ID, Description,
        Program_ID, Primary_Contact, Participants_Expected, Minutes_for_Setup,
        Event_Start_Date, Event_End_Date, Minutes_for_Cleanup, Cancelled, _Approved,
        Visibility_Level_ID, Featured_On_Calendar, Registration_Active, Register_Into_Series,
        _Web_Approved, Force_Login, [Allow_Check-in], Ignore_Program_Groups, Prohibit_Guests,
        Search_Results, Send_To_Heads, On_Connection_Card, On_Donation_Batch_Tool,
        Allow_Self_Checkin, Allow_Email, Show_Building_Room_Info, Allow_Fastpass, Minor_Registration,
        Parent_Event_ID, Domain_ID
    )
    SELECT
        'Perpetual Adoration - ' + s.TimeSlot,
        @EventTypeID, @CongregationID, @LocationID, @Description,
        @ProgramID, @PrimaryContact, 1, 0,
        s.StartDateTime, s.EndDateTime, 0, 0, 1,
        1, 0, 1, 0,          -- Visibility_Level_ID = 1 (Private); Registration_Active = 1
        0, 1, 0, 0, 0,       -- _Web_Approved = 0 (off the public web calendar)
        1, 0, 0, 0,
        0, 0, 1, 0, 0,
        NULL, @DomainID
    FROM Slots s
    WHERE NOT EXISTS (
        SELECT 1 FROM Events e
        WHERE e.Event_Type_ID    = @EventTypeID
          AND e.Congregation_ID  = @CongregationID
          AND e.Event_Start_Date = s.StartDateTime
    );

    DECLARE @Created INT = @@ROWCOUNT;

    ------------------------------------------------------------------
    -- 2. Reserve the room for any event that doesn't have it yet
    ------------------------------------------------------------------
    INSERT INTO Event_Rooms (Event_ID, Room_ID, Balance_Priority, Closed, Auto_Close_At_Capacity, Cancelled)
    SELECT e.Event_ID, @RoomID, 1, 0, 0, 0
    FROM Events e
    WHERE e.Event_Type_ID    = @EventTypeID
      AND e.Congregation_ID  = @CongregationID
      AND e.Event_Start_Date >= @StartDate
      AND e.Event_Start_Date <  @EndDate
      AND NOT EXISTS (
          SELECT 1 FROM Event_Rooms er
          WHERE er.Event_ID = e.Event_ID AND er.Room_ID = @RoomID);

    ------------------------------------------------------------------
    -- 3. Keep the events in the Perpetual Adoration series
    --    (reuse an existing series if one exists; else start one)
    ------------------------------------------------------------------
    DECLARE @SequenceID INT;

    SELECT @SequenceID = MIN(sr.Sequence_ID)
    FROM dp_Sequence_Records sr
    INNER JOIN Events e ON e.Event_ID = sr.Record_ID
    WHERE sr.Table_Name     = 'Events'
      AND e.Event_Type_ID   = @EventTypeID
      AND e.Congregation_ID = @CongregationID;

    IF @SequenceID IS NULL
        SELECT @SequenceID = ISNULL(MAX(Sequence_ID), 0) + 1 FROM dp_Sequence_Records;

    INSERT INTO dp_Sequence_Records (Sequence_ID, Table_Name, Record_ID)
    SELECT @SequenceID, 'Events', e.Event_ID
    FROM Events e
    WHERE e.Event_Type_ID    = @EventTypeID
      AND e.Congregation_ID  = @CongregationID
      AND e.Event_Start_Date >= @StartDate
      AND e.Event_Start_Date <  @EndDate
      AND NOT EXISTS (
          SELECT 1 FROM dp_Sequence_Records sr2
          WHERE sr2.Table_Name = 'Events' AND sr2.Record_ID = e.Event_ID);

    ------------------------------------------------------------------
    -- 4. Report what happened (shows up in the Agent job history)
    ------------------------------------------------------------------
    PRINT CONVERT(VARCHAR(30), GETDATE(), 120)
        + ' - Perpetual Adoration: created ' + CAST(@Created AS VARCHAR(10))
        + ' new slot(s) for window '
        + CONVERT(VARCHAR(10), @StartDate, 120) + ' to '
        + CONVERT(VARCHAR(10), @EndDate, 120) + ' (exclusive).';
END
GO


/* ============================================================
   MANUAL RUN (seed / test)
   ------------------------------------------------------------
   No arguments needed - it uses the defaults set in the SETTINGS
   block above. This one call both seeds the initial window and,
   run again later, extends it.

     EXEC dbo.custom_PerpetualAdoration_GenerateSlots;

   (You can still override a value for a one-off run if you want,
    e.g. EXEC dbo.custom_PerpetualAdoration_GenerateSlots @MonthsAhead = 12;)
   ============================================================ */


/* ============================================================
   SQL SERVER AGENT JOB TEMPLATE (schedule the monthly run)
   ------------------------------------------------------------
   Run ONCE, in the MinistryPlatform database context, to create a
   job that calls the procedure on the 1st of every month. The only
   thing to edit here is @database_name - the procedure uses the
   SETTINGS defaults you already set above, so no IDs are repeated.
   (Daily is also fine - change the schedule freq_type to 4/daily.)
   ------------------------------------------------------------
USE msdb;
GO
DECLARE @jobName SYSNAME = N'Perpetual Adoration - Generate Slots';

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @jobName)
    EXEC msdb.dbo.sp_delete_job @job_name = @jobName;

EXEC msdb.dbo.sp_add_job
     @job_name = @jobName,
     @description = N'Keeps a rolling 6-month window of Perpetual Adoration slots populated.';

EXEC msdb.dbo.sp_add_jobstep
     @job_name   = @jobName,
     @step_name  = N'Generate slots',
     @subsystem  = N'TSQL',
     @database_name = N'MinistryPlatform',   -- CHANGE to your MP database name
     @command    = N'EXEC dbo.custom_PerpetualAdoration_GenerateSlots;';   -- uses the SETTINGS defaults

-- Monthly on day 1 at 1:00 AM
EXEC msdb.dbo.sp_add_schedule
     @schedule_name = N'PA - Monthly on the 1st',
     @freq_type = 16,           -- monthly
     @freq_interval = 1,        -- day 1 of the month
     @freq_recurrence_factor = 1,
     @active_start_time = 010000;   -- 01:00:00

EXEC msdb.dbo.sp_attach_schedule @job_name = @jobName, @schedule_name = N'PA - Monthly on the 1st';
EXEC msdb.dbo.sp_add_jobserver   @job_name = @jobName;   -- runs on the local SQL Server
GO
   ============================================================ */
