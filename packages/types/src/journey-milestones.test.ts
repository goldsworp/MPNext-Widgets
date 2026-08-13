import { describe, it, expect } from 'vitest';
import {
  JourneyMilestoneSchema,
  JourneyMilestonesIndividualResponseSchema,
  JourneyMilestoneFamilyMemberSchema,
  JourneyMilestonesFamilyResponseSchema,
  type JourneyMilestone,
} from './journey-milestones';

const openMilestone: JourneyMilestone = {
  Milestone_ID: 104,
  Milestone_Title: 'Confirmation Registration',
  Icon: 'fa fa-clipboard-list',
  Sort_Order: 2,
  Achieved: false,
  Date_Accomplished: null,
  Form_ID: 18,
  Form_Title: 'Sacramental Preparation',
  Form_GUID: 'dcf4c9e3-c83d-4f81-b48c-1f474ba4b8d7',
  Event_ID: 522,
  Event_Title: 'Faith Formation & Sacramental Preparation',
};

describe('JourneyMilestoneSchema', () => {
  it('accepts an open milestone with a form and event link', () => {
    expect(JourneyMilestoneSchema.safeParse(openMilestone).success).toBe(true);
  });

  it('accepts an achieved milestone with a date', () => {
    const result = JourneyMilestoneSchema.safeParse({
      ...openMilestone,
      Achieved: true,
      Date_Accomplished: '2026-03-10',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a milestone with no form/event mapping at all', () => {
    const result = JourneyMilestoneSchema.safeParse({
      ...openMilestone,
      Form_ID: null,
      Form_Title: null,
      Form_GUID: null,
      Event_ID: null,
      Event_Title: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a null Sort_Order', () => {
    expect(JourneyMilestoneSchema.safeParse({ ...openMilestone, Sort_Order: null }).success).toBe(true);
  });

  it('rejects a string Achieved value', () => {
    const result = JourneyMilestoneSchema.safeParse({ ...openMilestone, Achieved: 'yes' });
    expect(result.success).toBe(false);
  });

  it('fails when Milestone_Title is missing', () => {
    const partial = { ...openMilestone } as Record<string, unknown>;
    delete partial.Milestone_Title;
    expect(JourneyMilestoneSchema.safeParse(partial).success).toBe(false);
  });
});

describe('JourneyMilestonesIndividualResponseSchema', () => {
  it('accepts a response with multiple milestones', () => {
    const result = JourneyMilestonesIndividualResponseSchema.safeParse({
      milestones: [openMilestone, { ...openMilestone, Milestone_ID: 105, Achieved: true, Date_Accomplished: '2026-04-12' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty milestones array', () => {
    expect(JourneyMilestonesIndividualResponseSchema.safeParse({ milestones: [] }).success).toBe(true);
  });
});

const familyMember: import('./journey-milestones').JourneyMilestoneFamilyMember = {
  Participant_ID: 1082,
  Contact_ID: 5001,
  Display_Name: 'Bordis, Rodolphe',
  Nickname: null,
  First_Name: 'Rodolphe',
  Last_Name: 'Bordis',
  Milestones: [openMilestone],
};

describe('JourneyMilestoneFamilyMemberSchema', () => {
  it('accepts a member with milestones', () => {
    expect(JourneyMilestoneFamilyMemberSchema.safeParse(familyMember).success).toBe(true);
  });

  it('accepts a member with no milestones yet', () => {
    expect(JourneyMilestoneFamilyMemberSchema.safeParse({ ...familyMember, Milestones: [] }).success).toBe(true);
  });

  it('fails when Display_Name is missing', () => {
    const partial = { ...familyMember } as Record<string, unknown>;
    delete partial.Display_Name;
    expect(JourneyMilestoneFamilyMemberSchema.safeParse(partial).success).toBe(false);
  });
});

describe('JourneyMilestonesFamilyResponseSchema', () => {
  it('accepts a response with multiple members', () => {
    const result = JourneyMilestonesFamilyResponseSchema.safeParse({
      members: [familyMember, { ...familyMember, Participant_ID: 1342, Display_Name: 'Bordis, Killie' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty members array', () => {
    expect(JourneyMilestonesFamilyResponseSchema.safeParse({ members: [] }).success).toBe(true);
  });
});
