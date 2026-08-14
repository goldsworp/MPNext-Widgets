/**************************************************************************************
    Script: register_Milestone_Forms_Page.sql
    Purpose: Register the dbo.Milestone_Forms table as a MinistryPlatform Page so staff
             can view/add/edit the mappings in the Platform UI.

    Target: MinistryPlatform | MS SQL Server 15.0 (SQL Server 2019)

    What this does:
      - Inserts one row into dbo.dp_Pages describing the page. MinistryPlatform builds
        the default "All Records" grid automatically from Default_Field_List, so no
        dp_Page_Views row is required for a basic, fully-editable page.

    Prerequisite:
      - Run create_Milestone_Forms.sql first (the table must exist).

    Safe to re-run: guarded so a second run won't create a duplicate page.

    REMAINING STEP (done in the Platform UI, not SQL):
      Page DEFINITION is created here, but VISIBILITY/ACCESS is governed per security
      role. In MinistryPlatform go to  Administration > Security Roles > Administrators
      (and any other role that should see it) > Pages, then add "Milestone Forms" to a
      navigation Page Section (e.g. the same section as Milestones/Journeys) and grant
      rights. Optionally set a page Icon there as well.
**************************************************************************************/

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dp_Pages WHERE [Table_Name] = N'Milestone_Forms')
BEGIN
    INSERT INTO dbo.dp_Pages
        ( [Display_Name],
          [Singular_Name],
          [Description],
          [View_Order],
          [Table_Name],
          [Primary_Key],
          [Default_Field_List],
          [Selected_Record_Expression],
          [Suppress_New_Button],
          [Display_Copy],
          [In_Global_Search],
          [Files_Publicly_Accessible] )
    VALUES
        ( N'Milestone Forms',                       -- Display_Name (plural, shown in navigation)
          N'Milestone Form',                        -- Singular_Name (record header / FK label)
          N'Maps each Milestone to the Form and/or Event used to complete it, per Congregation.',
          999,                                      -- View_Order (position within its section; adjust to taste)
          N'Milestone_Forms',                       -- Table_Name
          N'Milestone_Form_ID',                     -- Primary_Key
          -- Columns shown in the grid. FK columns use MP's _Table lookup convention
          -- so friendly names appear instead of raw IDs.
          N'Milestone_Forms.Milestone_Form_ID, Congregation_ID_Table.Congregation_Name AS Congregation, Milestone_ID_Table.Milestone_Title AS Milestone, Form_ID_Table.Form_Title AS Form, Event_ID_Table.Event_Title AS Event',
          -- How a single record is labeled (record header + drop-downs).
          N'Milestone_ID_Table.Milestone_Title + '' - '' + Congregation_ID_Table.Congregation_Name',
          0,   -- Suppress_New_Button (0 = allow New)
          1,   -- Display_Copy
          0,   -- In_Global_Search
          1 ); -- Files_Publicly_Accessible
END
GO

/*---------------------------------------------------------------------------------
  Bring an EXISTING page up to date: append the Event column to its grid field list
  if it isn't already there (idempotent; leaves any other customizations intact).
---------------------------------------------------------------------------------*/
UPDATE dbo.dp_Pages
SET    [Default_Field_List] = [Default_Field_List] + N', Event_ID_Table.Event_Title AS Event'
WHERE  [Table_Name] = N'Milestone_Forms'
  AND  [Default_Field_List] NOT LIKE N'%Event_ID_Table.Event_Title%';
GO

/*---------------------------------------------------------------------------------
  Verification (should return one row for the new page)
---------------------------------------------------------------------------------*/
SELECT [Page_ID], [Display_Name], [Singular_Name], [Table_Name], [Primary_Key],
       [Default_Field_List], [Selected_Record_Expression]
FROM   dbo.dp_Pages
WHERE  [Table_Name] = N'Milestone_Forms';
GO
