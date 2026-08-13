import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords, mockGetDomainInfo } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockGetDomainInfo: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      getDomainInfo = mockGetDomainInfo;
    },
  };
});

import { MassIntentionCalendarService } from '@/services/massIntentionCalendarService';
import { DomainTimezoneService } from '@/services/domainTimezoneService';

describe('MassIntentionCalendarService', () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so mockResolvedValueOnce queues drain.
    mockGetTableRecords.mockReset();
    mockGetDomainInfo.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MassIntentionCalendarService as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DomainTimezoneService as any).instance = null;
    // "Now" fixed well before any test event's start date, so nothing is
    // misclassified as Past unless a test explicitly wants that.
    mockGetDomainInfo.mockResolvedValue({ TimeZoneName: 'America/Chicago' });
  });

  describe('getInstance', () => {
    it('should return a singleton instance', async () => {
      const instance1 = await MassIntentionCalendarService.getInstance();
      const instance2 = await MassIntentionCalendarService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getMassEvents', () => {
    const baseEvent = {
      Event_ID: 752,
      Event_Title: 'Daily 7AM Mass',
      Event_Start_Date: '2099-08-12T07:00:00',
      Event_End_Date: '2099-08-12T07:30:00',
      Congregation_ID: 4,
      Congregation_Name: 'St. Joseph',
      Registration_Active: true,
    };

    it('returns an empty array when no events match, without querying registrants', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await MassIntentionCalendarService.getInstance();
      const result = await service.getMassEvents({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('marks an event with no registrants as Available', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseEvent])
        .mockResolvedValueOnce([]);

      const service = await MassIntentionCalendarService.getInstance();
      const result = await service.getMassEvents({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result).toHaveLength(1);
      expect(result[0].Registrant_Count).toBe(0);
      expect(result[0].Intention_Status).toBe('Available');
    });

    it('marks an event with registrants as Reserved', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseEvent])
        .mockResolvedValueOnce([{ Event_ID: 752, Registrant_Count: 2 }]);

      const service = await MassIntentionCalendarService.getInstance();
      const result = await service.getMassEvents({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(result[0].Registrant_Count).toBe(2);
      expect(result[0].Intention_Status).toBe('Reserved');
    });

    it('marks an event in the past as Past regardless of registrant count', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ ...baseEvent, Event_Start_Date: '2000-01-01T07:00:00' }])
        .mockResolvedValueOnce([]);

      const service = await MassIntentionCalendarService.getInstance();
      const result = await service.getMassEvents({ startDate: '2000-01-01', endDate: '2000-02-01' });

      expect(result[0].Intention_Status).toBe('Past');
    });

    it('includes a congregation filter in the events query when provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await MassIntentionCalendarService.getInstance();
      await service.getMassEvents({ startDate: '2099-08-01', endDate: '2099-09-01', congregationIds: [4, 8] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('Events.Congregation_ID IN (4,8)'),
        })
      );
    });

    it('omits the congregation filter when none is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await MassIntentionCalendarService.getInstance();
      await service.getMassEvents({ startDate: '2099-08-01', endDate: '2099-09-01' });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.not.stringContaining('Congregation_ID IN'),
        })
      );
    });
  });
});
