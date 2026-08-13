import { describe, it, expect } from 'vitest';
import {
  FaithFormationLeaderSchema,
  FaithFormationMeetingSchema,
  FaithFormationCurrentGroupSchema,
  FaithFormationPastGroupSchema,
  FaithFormationPersonSchema,
  FaithFormationResponseSchema,
  type FaithFormationLeader,
  type FaithFormationMeeting,
  type FaithFormationPerson,
} from './faith-formation';

const validLeader: FaithFormationLeader = {
  Contact_ID: 500,
  Display_Name: 'Goldsworthy, Paul',
  Photo_URL: null,
  Role_Title: 'Catechist',
  Mobile_Phone: '555-1234',
  Email_Address: 'paul@example.com',
};

const validMeeting: FaithFormationMeeting = {
  Event_ID: 346,
  Event_Title: 'Youth Faith Formation',
  Event_Start_Date: '2026-07-22T18:00:00',
  Event_End_Date: '2026-07-22T19:00:00',
  Participation_Status_ID: 3,
  Is_Present: true,
};

const validPerson: FaithFormationPerson = {
  Contact_ID: 975,
  Display_Name: 'Rysdale, Kermit',
  Photo_URL: null,
  CurrentGroups: [
    {
      Group_Participant_ID: 49,
      Group_ID: 69,
      Group_Name: 'Kindergarten',
      Participant_Start_Date: '2025-08-19T16:00:00',
      Participant_End_Date: '2026-08-31T02:05:06.083',
      Leaders: [validLeader],
      UpcomingMeetings: [validMeeting],
      PastMeetings: [validMeeting],
    },
  ],
  PastGroups: [
    {
      Group_Participant_ID: 10,
      Group_ID: 60,
      Group_Name: 'Toddlers',
      Participant_Start_Date: '2024-08-19T16:00:00',
      Participant_End_Date: '2025-06-01T00:00:00',
      Total_Meetings: 20,
      Attended_Meetings: 18,
      Leaders: [validLeader],
      Meetings: [validMeeting],
    },
  ],
};

describe('FaithFormationLeaderSchema', () => {
  it('accepts a fully populated leader', () => {
    expect(FaithFormationLeaderSchema.safeParse(validLeader).success).toBe(true);
  });

  it('accepts null for Photo_URL, Mobile_Phone, and Email_Address', () => {
    const result = FaithFormationLeaderSchema.safeParse({
      ...validLeader,
      Photo_URL: null,
      Mobile_Phone: null,
      Email_Address: null,
    });
    expect(result.success).toBe(true);
  });

  it('fails when Contact_ID is missing', () => {
    const partial = { ...validLeader } as Record<string, unknown>;
    delete partial.Contact_ID;
    expect(FaithFormationLeaderSchema.safeParse(partial).success).toBe(false);
  });
});

describe('FaithFormationMeetingSchema', () => {
  it('accepts a fully populated meeting', () => {
    expect(FaithFormationMeetingSchema.safeParse(validMeeting).success).toBe(true);
  });

  it('accepts null Participation_Status_ID and Is_Present (upcoming meetings)', () => {
    const result = FaithFormationMeetingSchema.safeParse({
      ...validMeeting,
      Participation_Status_ID: null,
      Is_Present: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a string Event_ID', () => {
    const result = FaithFormationMeetingSchema.safeParse({ ...validMeeting, Event_ID: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('FaithFormationCurrentGroupSchema', () => {
  it('accepts a group with empty Leaders/meetings arrays', () => {
    const result = FaithFormationCurrentGroupSchema.safeParse({
      ...validPerson.CurrentGroups[0],
      Leaders: [],
      UpcomingMeetings: [],
      PastMeetings: [],
    });
    expect(result.success).toBe(true);
  });

  it('fails when Group_Name is missing', () => {
    const partial = { ...validPerson.CurrentGroups[0] } as Record<string, unknown>;
    delete partial.Group_Name;
    expect(FaithFormationCurrentGroupSchema.safeParse(partial).success).toBe(false);
  });
});

describe('FaithFormationPastGroupSchema', () => {
  it('accepts a fully populated past group', () => {
    expect(FaithFormationPastGroupSchema.safeParse(validPerson.PastGroups[0]).success).toBe(true);
  });

  it('rejects a string Total_Meetings', () => {
    const result = FaithFormationPastGroupSchema.safeParse({
      ...validPerson.PastGroups[0],
      Total_Meetings: 'twenty',
    });
    expect(result.success).toBe(false);
  });
});

describe('FaithFormationPersonSchema', () => {
  it('accepts a fully populated person', () => {
    expect(FaithFormationPersonSchema.safeParse(validPerson).success).toBe(true);
  });

  it('accepts empty CurrentGroups and PastGroups arrays', () => {
    const result = FaithFormationPersonSchema.safeParse({
      ...validPerson,
      CurrentGroups: [],
      PastGroups: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('FaithFormationResponseSchema', () => {
  it('accepts a response with multiple people', () => {
    const result = FaithFormationResponseSchema.safeParse({
      people: [validPerson, { ...validPerson, Contact_ID: 976 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty people array', () => {
    expect(FaithFormationResponseSchema.safeParse({ people: [] }).success).toBe(true);
  });

  it('fails when people is missing', () => {
    expect(FaithFormationResponseSchema.safeParse({}).success).toBe(false);
  });
});
