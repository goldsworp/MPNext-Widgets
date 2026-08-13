import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords, mockCreateTableRecords, mockGetDomainInfo } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockCreateTableRecords: vi.fn(),
  mockGetDomainInfo: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      createTableRecords = mockCreateTableRecords;
      getDomainInfo = mockGetDomainInfo;
    },
  };
});

import { PerpetualAdorationService } from '@/services/perpetualAdorationService';
import { DomainTimezoneService } from '@/services/domainTimezoneService';

describe('PerpetualAdorationService', () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so mockResolvedValueOnce queues drain.
    mockGetTableRecords.mockReset();
    mockCreateTableRecords.mockReset();
    mockGetDomainInfo.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PerpetualAdorationService as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DomainTimezoneService as any).instance = null;
    mockGetDomainInfo.mockResolvedValue({ TimeZoneName: 'America/Chicago' });
  });

  describe('getInstance', () => {
    it('returns a singleton instance', async () => {
      const instance1 = await PerpetualAdorationService.getInstance();
      const instance2 = await PerpetualAdorationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getSlots', () => {
    const baseEvent = {
      Event_ID: 852,
      Event_Title: 'Perpetual Adoration - Sun 12:00 AM',
      Event_Start_Date: '2099-08-16T00:00:00',
      Event_End_Date: '2099-08-16T01:00:00',
      Congregation_ID: 4,
      Congregation_Name: 'St. Joseph',
      Registration_Active: true,
    };

    it('returns an empty array when no slots match, without querying participants', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.getSlots({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('marks a slot with no adorer as Needs Adorer', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseEvent])
        .mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.getSlots({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result).toHaveLength(1);
      expect(result[0].Registrant_Count).toBe(0);
      expect(result[0].Slot_Status).toBe('Needs Adorer');
      expect(result[0].First_Participant).toBeNull();
    });

    it('marks a slot with an adorer as Adorer Committed and reports the first sign-up', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseEvent])
        .mockResolvedValueOnce([
          { Event_ID: 852, Event_Participant_ID: 100, Display_Name: 'Goldsworthy, Paul' },
          { Event_ID: 852, Event_Participant_ID: 200, Display_Name: 'Herzing, Katie' },
        ]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.getSlots({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result[0].Registrant_Count).toBe(2);
      expect(result[0].Slot_Status).toBe('Adorer Committed');
      expect(result[0].First_Participant).toBe('Goldsworthy, Paul');
    });

    it('includes a congregation filter in the events query when provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      await service.getSlots({ startDate: '2099-08-01', endDate: '2099-09-01', congregationIds: [4, 8] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.stringContaining('Events.Congregation_ID IN (4,8)') })
      );
    });

    it('omits the congregation filter when none is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      await service.getSlots({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.not.stringContaining('Congregation_ID IN') })
      );
    });
  });

  describe('registerSlots', () => {
    it('returns an error result immediately when no event IDs are given', async () => {
      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'abc', eventIds: [] });

      expect(result.result).toBe('error');
      expect(mockGetTableRecords).not.toHaveBeenCalled();
    });

    it('returns an error result when the user cannot be resolved to a participant', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]); // dp_Users lookup finds nothing

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'unknown-guid', eventIds: [852] });

      expect(result.result).toBe('error');
      expect(result.message).toMatch(/could not identify/i);
      expect(mockCreateTableRecords).not.toHaveBeenCalled();
    });

    it('registers eligible slots and reports the count', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])           // dp_Users
        .mockResolvedValueOnce([{ Participant_Record: 55 }])   // Contacts
        .mockResolvedValueOnce([{ Event_ID: 852 }, { Event_ID: 853 }]) // eligible Events
        .mockResolvedValueOnce([]);                            // no existing Event_Participants
      mockCreateTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'guid-1', eventIds: [852, 853] });

      expect(result.result).toBe('ok');
      expect(result.participantId).toBe(55);
      expect(result.requestedCount).toBe(2);
      expect(result.registeredCount).toBe(2);
      expect(result.registeredEventIds.sort()).toEqual([852, 853]);
      expect(mockCreateTableRecords).toHaveBeenCalledWith(
        'Event_Participants',
        expect.arrayContaining([
          expect.objectContaining({ Event_ID: 852, Participant_ID: 55, Participation_Status_ID: 2 }),
          expect.objectContaining({ Event_ID: 853, Participant_ID: 55, Participation_Status_ID: 2 }),
        ])
      );
    });

    it('falls back to a Participants lookup when Contacts.Participant_Record is null', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: null }])
        .mockResolvedValueOnce([{ Participant_ID: 77 }])       // Participants fallback
        .mockResolvedValueOnce([{ Event_ID: 852 }])
        .mockResolvedValueOnce([]);
      mockCreateTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'guid-1', eventIds: [852] });

      expect(result.participantId).toBe(77);
    });

    it('excludes a slot already claimed by someone else', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([{ Event_ID: 852 }, { Event_ID: 853 }])
        .mockResolvedValueOnce([{ Event_ID: 852, Participant_ID: 999 }]); // someone else holds 852
      mockCreateTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'guid-1', eventIds: [852, 853] });

      expect(result.registeredCount).toBe(1);
      expect(result.registeredEventIds).toEqual([853]);
      expect(mockCreateTableRecords).toHaveBeenCalledWith(
        'Event_Participants',
        [expect.objectContaining({ Event_ID: 853 })]
      );
    });

    it('excludes a slot the user already holds, without creating a duplicate', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([{ Event_ID: 852 }])
        .mockResolvedValueOnce([{ Event_ID: 852, Participant_ID: 55 }]); // this user already holds it

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'guid-1', eventIds: [852] });

      expect(result.result).toBe('ok');
      expect(result.registeredCount).toBe(0);
      expect(mockCreateTableRecords).not.toHaveBeenCalled();
    });

    it('excludes an event ID that is not a real, open Perpetual Adoration event', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 10 }])
        .mockResolvedValueOnce([{ Participant_Record: 55 }])
        .mockResolvedValueOnce([{ Event_ID: 852 }])   // only 852 is real/open; 999 was requested but not returned
        .mockResolvedValueOnce([]);
      mockCreateTableRecords.mockResolvedValueOnce([]);

      const service = await PerpetualAdorationService.getInstance();
      const result = await service.registerSlots({ userGuid: 'guid-1', eventIds: [852, 999] });

      expect(result.registeredEventIds).toEqual([852]);
    });
  });
});
