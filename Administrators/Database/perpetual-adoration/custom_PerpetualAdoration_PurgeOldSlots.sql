/* ============================================================
   custom_PerpetualAdoration_PurgeOldSlots
   ------------------------------------------------------------
   OPTIONAL, MANUAL cleanup of old Perpetual Adoration slots.

   This is deliberately NOT automated and NOT part of the monthly
   generator. Deleting church records is irreversible, so run it by
   hand, after a backup, and only when you actually need to reclaim
   space.

   Two safety features:
     @Preview = 1 (default)  -> only REPORTS what would be deleted;
                                nothing is removed. Review the counts,
                                then run again with @Preview = 0.
     @KeepFilled = 1 (default) -> only removes slots that NO ONE ever
                                signed up for. Slots with a committed
                                adorer (statuses 2/3/4) are preserved,
                                because that participation history is
                                usually worth keeping.

   Deletes child rows first (participants, rooms, series links, and
   other Event_* children) in FK-safe order, inside a transaction.

   TIP: prefer this over deleting in bulk by hand - it gets the
   delete order right. If you would rather keep everything but hide
   it, cancel the slots instead (set Cancelled = 1); the calendar
   widget hides cancelled events.
   ============================================================ */
GO
CREATE OR ALTER PROCEDURE dbo.custom_PerpetualAdoration_PurgeOldSlots
    -- ============================================================
    --  *** SETTINGS - EDIT THESE DEFAULTS ONCE ***
    --  Set @CongregationID (and @EventTypeID if different) once here;
    --  the usage examples below then run with no IDs. @OlderThanMonths,
    --  @KeepFilled, and @Preview are per-run choices you pass at call time.
    -- ============================================================
    @EventTypeID     INT = 14,   -- Perpetual Adoration
    @CongregationID  INT = 1,    -- CHANGE to the correct congregation / parish
    @OlderThanMonths INT = 24,   -- delete slots whose start is older than this many months
    @KeepFilled      BIT = 1,    -- 1 = keep slots that had a committed adorer (recommended)
    @Preview         BIT = 1     -- 1 = report only; 0 = actually delete
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Cutoff DATETIME = DATEADD(MONTH, -@OlderThanMonths, CAST(GETDATE() AS DATE));

    -- Collect the Event_IDs that qualify for removal.
    IF OBJECT_ID('tempdb..#ToPurge') IS NOT NULL DROP TABLE #ToPurge;

    SELECT e.Event_ID, e.Event_Start_Date
    INTO #ToPurge
    FROM Events e
    WHERE e.Event_Type_ID    = @EventTypeID
      AND e.Congregation_ID  = @CongregationID
      AND e.Event_Start_Date < @Cutoff
      AND ( @KeepFilled = 0
            OR NOT EXISTS (
                 SELECT 1 FROM Event_Participants ep
                 WHERE ep.Event_ID = e.Event_ID
                   AND ep.Participation_Status_ID IN (2, 3, 4) ) );

    ------------------------------------------------------------------
    -- PREVIEW: show what would be deleted, then stop.
    ------------------------------------------------------------------
    IF @Preview = 1
    BEGIN
        SELECT
            COUNT(*)                 AS Events_To_Delete,
            MIN(Event_Start_Date)    AS Earliest,
            MAX(Event_Start_Date)    AS Latest,
            @Cutoff                  AS Cutoff_Before,
            CASE WHEN @KeepFilled = 1 THEN 'Yes - keeping slots with a committed adorer'
                 ELSE 'No - deleting even slots that had adorers' END AS Preserving_History
        FROM #ToPurge;

        PRINT 'PREVIEW ONLY - nothing was deleted. Re-run with @Preview = 0 to delete.';
        RETURN;
    END

    ------------------------------------------------------------------
    -- DELETE (child rows first, then the events) in one transaction.
    ------------------------------------------------------------------
    BEGIN TRY
        BEGIN TRAN;

            DELETE ep FROM Event_Participants ep INNER JOIN #ToPurge p ON p.Event_ID = ep.Event_ID;
            DELETE er FROM Event_Rooms        er INNER JOIN #ToPurge p ON p.Event_ID = er.Event_ID;
            DELETE eg FROM Event_Groups       eg INNER JOIN #ToPurge p ON p.Event_ID = eg.Event_ID;
            DELETE es FROM Event_Services     es INNER JOIN #ToPurge p ON p.Event_ID = es.Event_ID;
            DELETE em FROM Event_Metrics      em INNER JOIN #ToPurge p ON p.Event_ID = em.Event_ID;
            DELETE ee FROM Event_Equipment    ee INNER JOIN #ToPurge p ON p.Event_ID = ee.Event_ID;

            DELETE sr FROM dp_Sequence_Records sr
              INNER JOIN #ToPurge p ON p.Event_ID = sr.Record_ID
              WHERE sr.Table_Name = 'Events';

            DECLARE @Deleted INT;
            DELETE e FROM Events e INNER JOIN #ToPurge p ON p.Event_ID = e.Event_ID;
            SET @Deleted = @@ROWCOUNT;

        COMMIT;

        PRINT 'Deleted ' + CAST(@Deleted AS VARCHAR(10)) + ' Perpetual Adoration slot(s) older than '
            + CONVERT(VARCHAR(10), @Cutoff, 120) + '.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        -- If this fails on a foreign key, another Event_* child table
        -- references these events; add a matching DELETE above and re-run.
        THROW;
    END CATCH
END
GO


/* ============================================================
   USAGE  (congregation comes from the SETTINGS default above)
   ------------------------------------------------------------
   1) Preview (safe - reports only), keeping any slot that had an adorer:
        EXEC dbo.custom_PerpetualAdoration_PurgeOldSlots @OlderThanMonths = 24;

   2) After reviewing the preview, actually delete:
        EXEC dbo.custom_PerpetualAdoration_PurgeOldSlots @OlderThanMonths = 24, @Preview = 0;

   3) Full purge past the horizon (also removes slots that had adorers -
      destroys that history; back up first):
        EXEC dbo.custom_PerpetualAdoration_PurgeOldSlots
             @OlderThanMonths = 24, @KeepFilled = 0, @Preview = 0;
   ============================================================ */
