/**************************************************************************************
    Script: create_Process_FormResponseMilestone.sql
    Purpose: Register (or UPDATE) a MinistryPlatform Process whose single Type-3
             ("Run Procedure") step contains ALL of the milestone-creation logic INLINE.
             When a Form Response is created for a Form mapped in Milestone_Forms, the
             step records the matching Participant_Milestones ("Milestone Assigned").

    Approach:
      The step's SQL uses the MinistryPlatform Process token dp_RecordID, which the
      engine replaces with the triggering record's primary key (the new Form_Response_ID).
      So the step operates on exactly the record that fired -- no separate stored
      procedure and no table sweep. The milestone and program are resolved from the tables
      (Milestone_Forms and Forms), so this stays portable across systems.

    RE-RUN BEHAVIOR (important):
      This script is an UPSERT. If the Process / step already exist, it UPDATES them to
      match this file (so editing the SQL here and re-running actually takes effect).
      You do NOT need to delete the old Process first.

    NOTE: The inline SQL can't be run in SSMS as-is because dp_RecordID only exists inside
    the Process engine. To test manually, copy the SQL and replace dp_RecordID with a real
    Form_Response_ID.

    Target: MinistryPlatform | MS SQL Server 15.0 (SQL Server 2019)
**************************************************************************************/

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

DECLARE @Domain_ID    INT           = 1;
DECLARE @ProcessName  NVARCHAR(50)  = N'Form Response - Create Milestone';
DECLARE @StepName     NVARCHAR(50)  = N'Create Milestone from Form Response';
DECLARE @Description  NVARCHAR(500) = N'When a Form Response is created (or its Contact is set/changed) for a Form mapped in Milestone_Forms, create the matching Participant_Milestone.';
DECLARE @StepInstr    NVARCHAR(500) = N'Creates a Participant_Milestone for a milestone-mapped form response (logic is inline; uses dp_RecordID).';

-- Fire only for milestone-mapped forms, and never for the Default Contact (#2). With
-- forced login the response is tied to a real person; excluding #2 (and NULL) is a
-- safety net in case a form is left without Force_Login.
DECLARE @DependentCondition NVARCHAR(1000) =
    N'Form_Response_ID > 0 AND Form_Responses.Contact_ID IS NOT NULL AND Form_Responses.Contact_ID <> 2 AND EXISTS (SELECT 1 FROM Milestone_Forms mf WHERE mf.Form_ID = Form_Responses.Form_ID)';

-- Inline step logic. dp_RecordID = the triggering Form_Response_ID (substituted by the
-- Process engine). Resolves milestone (Milestone_Forms), program (Forms) and participant
-- (the response's Contact); skips the Default Contact (#2). Kept compact and comment-free
-- because dp_Process_Steps.SQL_Statement is limited to 1000 characters. Expanded/readable
-- form of this same logic is in create_proc_FormResponse_CreateMilestone.sql.
DECLARE @SqlStatement NVARCHAR(MAX) = N'DECLARE @fr INT=dp_RecordID,@fid INT,@cid INT,@mid INT,@pid INT,@part INT;
SELECT @fid=Form_ID,@cid=Contact_ID FROM dbo.Form_Responses WHERE Form_Response_ID=@fr;
SELECT TOP(1) @mid=Milestone_ID FROM dbo.Milestone_Forms WHERE Form_ID=@fid ORDER BY Milestone_Form_ID;
SELECT @pid=Program_ID FROM dbo.Forms WHERE Form_ID=@fid;
SELECT @part=Participant_Record FROM dbo.Contacts WHERE Contact_ID=@cid;
IF @part IS NULL SELECT TOP(1) @part=Participant_ID FROM dbo.Participants WHERE Contact_ID=@cid ORDER BY Participant_ID;
IF @mid IS NOT NULL AND @pid IS NOT NULL AND @part IS NOT NULL AND @cid IS NOT NULL AND @cid<>2 AND NOT EXISTS(SELECT 1 FROM dbo.Participant_Milestones WHERE Participant_ID=@part AND Milestone_ID=@mid)
INSERT INTO dbo.Participant_Milestones(Participant_ID,Milestone_ID,Program_ID,Date_Accomplished,At_Prior_Church,Followed_Up,Discontinue_Journey,Domain_ID)
VALUES(@part,@mid,@pid,GETDATE(),0,0,0,1)';

-- Owner: reuse an existing Process_Manager user so this is valid on any system.
DECLARE @Mgr INT;
SELECT TOP (1) @Mgr = p.[Process_Manager]
FROM   dbo.dp_Processes p
WHERE  p.[Process_Manager] IS NOT NULL
ORDER BY p.[Process_ID];

IF @Mgr IS NULL
BEGIN
    RAISERROR('No existing Process_Manager user was found to own the new process; set @Mgr explicitly.', 16, 1);
    RETURN;
END

/*---------------------------------------------------------------------------------
  1) The Process (upsert): fires on Form_Responses CREATE and on Contact_ID UPDATE
     (to catch reassignment to the selected family member), milestone-mapped forms only
---------------------------------------------------------------------------------*/
DECLARE @Process_ID INT;
SELECT @Process_ID = [Process_ID] FROM dbo.dp_Processes WHERE [Process_Name] = @ProcessName;

IF @Process_ID IS NULL
BEGIN
    INSERT INTO dbo.dp_Processes
        ( [Process_Name], [Process_Manager], [Active], [Description],
          [Trigger_Fields], [Dependent_Condition],
          [Trigger_On_Create], [Trigger_On_Update], [Table_Name], [Domain_ID] )
    VALUES
        ( @ProcessName, @Mgr, 1, @Description,
          N'Contact_ID', @DependentCondition,   -- Trigger_Fields: fire on Contact_ID change
          1, 1, N'Form_Responses', @Domain_ID ); -- Trigger_On_Create = 1, Trigger_On_Update = 1

    SET @Process_ID = SCOPE_IDENTITY();
END
ELSE
BEGIN
    -- Bring the existing Process up to date with this file.
    UPDATE dbo.dp_Processes
    SET [Active]              = 1,
        [Description]         = @Description,
        [Trigger_Fields]      = N'Contact_ID',   -- fire on Contact_ID change (family reassignment)
        [Dependent_Condition] = @DependentCondition,
        [Trigger_On_Create]   = 1,
        [Trigger_On_Update]   = 1,
        [Table_Name]          = N'Form_Responses'
    WHERE [Process_ID] = @Process_ID;
END

/*---------------------------------------------------------------------------------
  2) The SQL step (upsert): Type 3, inline milestone-creation logic
---------------------------------------------------------------------------------*/
IF EXISTS (SELECT 1 FROM dbo.dp_Process_Steps
           WHERE [Process_ID] = @Process_ID AND [Process_Step_Type_ID] = 3)
BEGIN
    -- Update the existing SQL step so edits to @SqlStatement above take effect.
    UPDATE dbo.dp_Process_Steps
    SET [Step_Name]     = @StepName,
        [Instructions]  = @StepInstr,
        [Order]         = 1,
        [Specific_User] = @Mgr,
        [SQL_Statement] = @SqlStatement
    WHERE [Process_ID] = @Process_ID AND [Process_Step_Type_ID] = 3;
END
ELSE
BEGIN
    INSERT INTO dbo.dp_Process_Steps
        ( [Step_Name], [Instructions], [Process_Step_Type_ID], [Escalation_Only],
          [Order], [Process_ID], [Specific_User], [Supervisor_User],
          [SQL_Statement], [Domain_ID] )
    VALUES
        ( @StepName, @StepInstr,
          3,        -- Process_Step_Type_ID 3 = Run Procedure / SQL
          0,        -- Escalation_Only
          1,        -- Order
          @Process_ID,
          @Mgr,     -- Specific_User (same convention as processes 21/24)
          0,        -- Supervisor_User
          @SqlStatement,
          @Domain_ID );
END

/*---------------------------------------------------------------------------------
  3) Verification
---------------------------------------------------------------------------------*/
SELECT [Process_ID], [Process_Name], [Active], [Table_Name],
       [Trigger_On_Create], [Trigger_On_Update], [Trigger_Fields], [Dependent_Condition]
FROM   dbo.dp_Processes
WHERE  [Process_ID] = @Process_ID;

SELECT [Process_Step_ID], [Step_Name], [Process_Step_Type_ID], [Order], [SQL_Statement]
FROM   dbo.dp_Process_Steps
WHERE  [Process_ID] = @Process_ID
ORDER BY [Order];
GO
