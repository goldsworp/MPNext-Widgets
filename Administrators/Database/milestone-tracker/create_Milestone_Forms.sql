/**************************************************************************************
    Table: dbo.Milestone_Forms
    Purpose: Maps a Milestone to the way a parishioner completes it for a given
             Congregation (parish) - either a Form and/or an Event. Both the Form and
             the Event are OPTIONAL, so a mapping can point to a Form, an Event, or both.
             One row = "for Congregation X, Milestone Y is completed via Form Z and/or Event E."

    Target: MinistryPlatform | MS SQL Server 15.0 (SQL Server 2019)

    Notes:
      - Follows MinistryPlatform table conventions (identity PK named <Table>_ID,
        Domain_ID for Platform multi-domain support, bracketed identifiers,
        WITH CHECK foreign keys, MS_Description extended properties for field help).
      - Domain_ID is included so this table can later be registered as a Platform
        page (dp_Pages) and maintained by staff in the MP UI.
      - Form_ID is OPTIONAL (nullable) and Event_ID is OPTIONAL (nullable).
      - Safe to re-run AND safe against an EXISTING table: fresh installs get the full
        definition; existing installs are brought up to date with guarded ALTERs
        (section 1b) that add Event_ID and relax Form_ID to nullable. Every constraint
        and extended property is guarded with IF NOT EXISTS.
**************************************************************************************/

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

/*---------------------------------------------------------------------------------
  1) Create the table (fresh installs)
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE [name] = N'Milestone_Forms' AND SCHEMA_NAME([schema_id]) = N'dbo')
BEGIN
    CREATE TABLE [dbo].[Milestone_Forms](
        [Milestone_Form_ID] [int] IDENTITY(1,1) NOT NULL,
        [Congregation_ID]   [int] NOT NULL,
        [Milestone_ID]      [int] NOT NULL,
        [Form_ID]           [int] NULL,          -- optional: the online form for this milestone
        [Event_ID]          [int] NULL,          -- optional: the event that fulfills this milestone
        [Domain_ID]         [int] NOT NULL,
     CONSTRAINT [PK_Milestone_Forms] PRIMARY KEY CLUSTERED
    (
        [Milestone_Form_ID] ASC
    )WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
    ) ON [PRIMARY]
END
GO

/*---------------------------------------------------------------------------------
  1b) Bring an EXISTING table up to date (idempotent)
      - Add Event_ID if it is missing.
      - Relax Form_ID to nullable if it is still NOT NULL.
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID(N'[dbo].[Milestone_Forms]') AND [name] = N'Event_ID')
    ALTER TABLE [dbo].[Milestone_Forms] ADD [Event_ID] [int] NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID(N'[dbo].[Milestone_Forms]') AND [name] = N'Form_ID' AND [is_nullable] = 0)
    ALTER TABLE [dbo].[Milestone_Forms] ALTER COLUMN [Form_ID] [int] NULL;
GO

/*---------------------------------------------------------------------------------
  2) Default for Domain_ID (MP default domain = 1)
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE [name] = N'DF_Milestone_Forms_Domain_ID')
    ALTER TABLE [dbo].[Milestone_Forms] ADD CONSTRAINT [DF_Milestone_Forms_Domain_ID] DEFAULT ((1)) FOR [Domain_ID]
GO

/*---------------------------------------------------------------------------------
  3) Foreign keys
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'FK_Milestone_Forms_Congregations')
    ALTER TABLE [dbo].[Milestone_Forms] WITH CHECK ADD CONSTRAINT [FK_Milestone_Forms_Congregations] FOREIGN KEY([Congregation_ID])
    REFERENCES [dbo].[Congregations] ([Congregation_ID])
GO
ALTER TABLE [dbo].[Milestone_Forms] CHECK CONSTRAINT [FK_Milestone_Forms_Congregations]
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'FK_Milestone_Forms_Milestones')
    ALTER TABLE [dbo].[Milestone_Forms] WITH CHECK ADD CONSTRAINT [FK_Milestone_Forms_Milestones] FOREIGN KEY([Milestone_ID])
    REFERENCES [dbo].[Milestones] ([Milestone_ID])
GO
ALTER TABLE [dbo].[Milestone_Forms] CHECK CONSTRAINT [FK_Milestone_Forms_Milestones]
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'FK_Milestone_Forms_Forms')
    ALTER TABLE [dbo].[Milestone_Forms] WITH CHECK ADD CONSTRAINT [FK_Milestone_Forms_Forms] FOREIGN KEY([Form_ID])
    REFERENCES [dbo].[Forms] ([Form_ID])
GO
ALTER TABLE [dbo].[Milestone_Forms] CHECK CONSTRAINT [FK_Milestone_Forms_Forms]
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'FK_Milestone_Forms_Events')
    ALTER TABLE [dbo].[Milestone_Forms] WITH CHECK ADD CONSTRAINT [FK_Milestone_Forms_Events] FOREIGN KEY([Event_ID])
    REFERENCES [dbo].[Events] ([Event_ID])
GO
ALTER TABLE [dbo].[Milestone_Forms] CHECK CONSTRAINT [FK_Milestone_Forms_Events]
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name] = N'FK_Milestone_Forms_dp_Domains')
    ALTER TABLE [dbo].[Milestone_Forms] WITH CHECK ADD CONSTRAINT [FK_Milestone_Forms_dp_Domains] FOREIGN KEY([Domain_ID])
    REFERENCES [dbo].[dp_Domains] ([Domain_ID])
GO
ALTER TABLE [dbo].[Milestone_Forms] CHECK CONSTRAINT [FK_Milestone_Forms_dp_Domains]
GO

/*---------------------------------------------------------------------------------
  4) Uniqueness: at most one mapping per Congregation + Milestone
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UQ_Milestone_Forms_Congregation_Milestone' AND object_id = OBJECT_ID(N'[dbo].[Milestone_Forms]'))
    ALTER TABLE [dbo].[Milestone_Forms] ADD CONSTRAINT [UQ_Milestone_Forms_Congregation_Milestone] UNIQUE ([Congregation_ID], [Milestone_ID])
GO

/*---------------------------------------------------------------------------------
  5) Field help (MS_Description extended properties)
---------------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'dbo', N'TABLE', N'Milestone_Forms', N'COLUMN', N'Congregation_ID'))
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The Congregation/Parish this milestone-to-form mapping applies to. Lets each parish use its own form for the same milestone.', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Milestone_Forms', @level2type=N'COLUMN',@level2name=N'Congregation_ID'
GO
IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'dbo', N'TABLE', N'Milestone_Forms', N'COLUMN', N'Milestone_ID'))
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The Milestone this mapping completes.', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Milestone_Forms', @level2type=N'COLUMN',@level2name=N'Milestone_ID'
GO
IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'dbo', N'TABLE', N'Milestone_Forms', N'COLUMN', N'Form_ID'))
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OPTIONAL. The Form a parishioner opens to find instructions for, and to complete, this milestone at this congregation. Leave blank if the milestone is completed via an Event or has no online form.', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Milestone_Forms', @level2type=N'COLUMN',@level2name=N'Form_ID'
GO
IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'dbo', N'TABLE', N'Milestone_Forms', N'COLUMN', N'Event_ID'))
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'OPTIONAL. The Event a parishioner attends/registers for to complete this milestone at this congregation. Leave blank if the milestone is completed via a Form or has no associated event.', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Milestone_Forms', @level2type=N'COLUMN',@level2name=N'Event_ID'
GO
IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'dbo', N'TABLE', N'Milestone_Forms', N'COLUMN', N'Domain_ID'))
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'The MinistryPlatform domain that owns this record.', @level0type=N'SCHEMA',@level0name=N'dbo', @level1type=N'TABLE',@level1name=N'Milestone_Forms', @level2type=N'COLUMN',@level2name=N'Domain_ID'
GO

/*---------------------------------------------------------------------------------
  6) Verification (each should return a row)
---------------------------------------------------------------------------------*/
SELECT 'Table exists'        AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.tables WHERE [name]=N'Milestone_Forms');
SELECT 'Event_ID column'     AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'[dbo].[Milestone_Forms]') AND [name]=N'Event_ID');
SELECT 'Form_ID nullable'    AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(N'[dbo].[Milestone_Forms]') AND [name]=N'Form_ID' AND [is_nullable]=1);
SELECT 'FK Congregations'    AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name]=N'FK_Milestone_Forms_Congregations');
SELECT 'FK Milestones'       AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name]=N'FK_Milestone_Forms_Milestones');
SELECT 'FK Forms'            AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name]=N'FK_Milestone_Forms_Forms');
SELECT 'FK Events'           AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name]=N'FK_Milestone_Forms_Events');
SELECT 'FK dp_Domains'       AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.foreign_keys WHERE [name]=N'FK_Milestone_Forms_dp_Domains');
SELECT 'Unique constraint'   AS Check_Name WHERE EXISTS (SELECT 1 FROM sys.indexes WHERE [name]=N'UQ_Milestone_Forms_Congregation_Milestone');
GO
