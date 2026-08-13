import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
    },
  };
});

import { JourneyMilestonesService } from '@/services/journeyMilestonesService';

describe('JourneyMilestonesService', () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so mockResolvedValueOnce queues drain.
    mockGetTableRecords.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (JourneyMilestonesService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('returns a singleton instance', async () => {
      const instance1 = await JourneyMilestonesService.getInstance();
      const instance2 = await JourneyMilestonesService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getIndividualMilestones', () => {
    const milestones = [
      { Milestone_ID: 104, Milestone_Title: 'Confirmation Registration', Icon: 'fa-clipboard', Sort_Order: 2 },
      { Milestone_ID: 139, Milestone_Title: 'Submit Baptismal Certificate', Icon: 'fa-certificate', Sort_Order: 1 },
    ];

    it('returns [] immediately when the user cannot be resolved to a contact', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]); // dp_Users finds nothing

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'unknown', journeyId: 18 });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('resolves the participant and returns milestones ordered by Sort_Order (no group gate)', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])            // dp_Users
        .mockResolvedValueOnce([{ Participant_Record: 55 }])    // Contacts
        .mockResolvedValueOnce([...milestones])                       // Milestones
        .mockResolvedValueOnce([]);                              // Participant_Milestones (none achieved)

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'guid-1', journeyId: 18 });

      expect(result).toHaveLength(2);
      expect(result[0].Milestone_ID).toBe(139); // Sort_Order 1 before 2
      expect(result.every((m) => m.Achieved === false)).toBe(true);
      // No groupId, so congregationId is never resolved and Milestone_Forms is never queried.
      expect(mockGetTableRecords).toHaveBeenCalledTimes(4);
    });

    it('falls back to a Participants lookup when Contacts.Participant_Record is null', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: null }])
        .mockResolvedValueOnce([{ Participant_ID: 77 }])         // Participants fallback
        .mockResolvedValueOnce([...milestones])
        .mockResolvedValueOnce([]);

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'guid-1', journeyId: 18 });

      expect(result).toHaveLength(2);
    });

    it('marks a milestone achieved with its date, and attaches the parish form/event link when a group is configured', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([{ Group_Participant_ID: 1 }])    // isCurrentGroupMember: is a member
        .mockResolvedValueOnce([{ Congregation_ID: 8 }])         // resolveGroupCongregation
        .mockResolvedValueOnce([...milestones])                        // Milestones
        .mockResolvedValueOnce([                                  // Milestone_Forms
          { Milestone_ID: 104, Form_ID: 18, Form_Title: 'Sacramental Prep', Form_GUID: 'guid-x', Event_ID: 522, Event_Title: 'Prep Event' },
        ])
        .mockResolvedValueOnce([                                  // Participant_Milestones
          { Participant_Milestone_ID: 1, Participant_ID: 55, Milestone_ID: 104, Date_Accomplished: '2026-03-10T13:00:00' },
        ]);

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'guid-1', journeyId: 18, groupId: 136 });

      const achieved = result.find((m) => m.Milestone_ID === 104)!;
      expect(achieved.Achieved).toBe(true);
      expect(achieved.Date_Accomplished).toBe('2026-03-10');

      const notAchieved = result.find((m) => m.Milestone_ID === 139)!;
      expect(notAchieved.Achieved).toBe(false);
      expect(notAchieved.Form_ID).toBeNull(); // no Milestone_Forms row for 139 in this fixture
    });

    it('returns [] without touching milestones when a group is configured and the user is not a current member', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([]); // isCurrentGroupMember: not a member

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'guid-1', journeyId: 18, groupId: 136 });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(3);
    });

    it('prefers the dated, most recent record when picking the achieved date for a milestone', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([milestones[0]])
        .mockResolvedValueOnce([
          { Participant_Milestone_ID: 1, Participant_ID: 55, Milestone_ID: 104, Date_Accomplished: null },
          { Participant_Milestone_ID: 3, Participant_ID: 55, Milestone_ID: 104, Date_Accomplished: '2026-01-01T00:00:00' },
          { Participant_Milestone_ID: 2, Participant_ID: 55, Milestone_ID: 104, Date_Accomplished: '2026-03-10T13:00:00' },
        ]);

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getIndividualMilestones({ userGuid: 'guid-1', journeyId: 18 });

      expect(result[0].Date_Accomplished).toBe('2026-03-10');
    });
  });

  describe('getFamilyMilestones', () => {
    it('returns [] immediately when the household cannot be resolved', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]); // dp_Users finds nothing

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getFamilyMilestones({ userGuid: 'unknown', journeyId: 18, groupId: 136 });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('returns [] without querying milestones when no household members are in the group', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Household_ID: 164 }])  // dp_Users -> household
        .mockResolvedValueOnce([{ Congregation_ID: 8 }]) // Groups
        .mockResolvedValueOnce([]);                       // Group_Participants: no members

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getFamilyMilestones({ userGuid: 'guid-1', journeyId: 18, groupId: 136 });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(3);
    });

    it('returns each household member with their own milestones nested', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Household_ID: 164 }])
        .mockResolvedValueOnce([{ Congregation_ID: 8 }])
        .mockResolvedValueOnce([
          { Participant_ID: 1082, Contact_ID: 5001, Display_Name: 'Bordis, Rodolphe', Nickname: null, First_Name: 'Rodolphe', Last_Name: 'Bordis' },
          { Participant_ID: 1342, Contact_ID: 5002, Display_Name: 'Bordis, Killie', Nickname: null, First_Name: 'Killie', Last_Name: 'Bordis' },
        ])
        .mockResolvedValueOnce([{ Milestone_ID: 104, Milestone_Title: 'Confirmation Registration', Icon: null, Sort_Order: 1 }])
        .mockResolvedValueOnce([]) // Milestone_Forms
        .mockResolvedValueOnce([
          { Participant_Milestone_ID: 1, Participant_ID: 1082, Milestone_ID: 104, Date_Accomplished: '2026-03-10T13:00:00' },
        ]);

      const service = await JourneyMilestonesService.getInstance();
      const result = await service.getFamilyMilestones({ userGuid: 'guid-1', journeyId: 18, groupId: 136 });

      expect(result).toHaveLength(2);
      const rodolphe = result.find((m) => m.Participant_ID === 1082)!;
      const killie = result.find((m) => m.Participant_ID === 1342)!;
      expect(rodolphe.Milestones[0].Achieved).toBe(true);
      expect(killie.Milestones[0].Achieved).toBe(false);
    });
  });
});
