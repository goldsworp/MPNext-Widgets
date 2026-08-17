import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords, mockCreateTableRecords, mockSendMessage, mockGetDomainInfo } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockCreateTableRecords: vi.fn(),
  mockSendMessage: vi.fn(),
  mockGetDomainInfo: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      createTableRecords = mockCreateTableRecords;
      sendMessage = mockSendMessage;
      getDomainInfo = mockGetDomainInfo;
    },
  };
});

import {
  SpaceAvailabilityService,
  parseMpWallClockToUtcMs,
  utcMsToMpWallClockString,
  effectiveWindowMs,
  rangesOverlap,
} from '@/services/spaceAvailabilityService';
import { DomainTimezoneService } from '@/services/domainTimezoneService';

describe('parseMpWallClockToUtcMs / utcMsToMpWallClockString', () => {
  it('round-trips a wall-clock string', () => {
    const ms = parseMpWallClockToUtcMs('2026-08-20 09:00:00');
    expect(ms).not.toBeNull();
    expect(utcMsToMpWallClockString(ms!)).toBe('2026-08-20 09:00:00');
  });

  it('accepts a T-separated string with no seconds', () => {
    const ms = parseMpWallClockToUtcMs('2026-08-20T09:00');
    expect(ms).not.toBeNull();
    expect(utcMsToMpWallClockString(ms!)).toBe('2026-08-20 09:00:00');
  });

  it('returns null for an unparseable string', () => {
    expect(parseMpWallClockToUtcMs('not a date')).toBeNull();
  });
});

describe('effectiveWindowMs', () => {
  it('subtracts setup minutes from the start and adds cleanup minutes to the end', () => {
    const window = effectiveWindowMs('2026-08-20 09:00:00', '2026-08-20 10:00:00', 15, 30);
    expect(window).not.toBeNull();
    expect(utcMsToMpWallClockString(window!.startMs)).toBe('2026-08-20 08:45:00');
    expect(utcMsToMpWallClockString(window!.endMs)).toBe('2026-08-20 10:30:00');
  });

  it('handles zero setup/cleanup as a no-op', () => {
    const window = effectiveWindowMs('2026-08-20 09:00:00', '2026-08-20 10:00:00', 0, 0);
    expect(utcMsToMpWallClockString(window!.startMs)).toBe('2026-08-20 09:00:00');
    expect(utcMsToMpWallClockString(window!.endMs)).toBe('2026-08-20 10:00:00');
  });

  it('carries setup minutes across a day boundary', () => {
    const window = effectiveWindowMs('2026-08-20 00:10:00', '2026-08-20 01:00:00', 20, 0);
    expect(utcMsToMpWallClockString(window!.startMs)).toBe('2026-08-19 23:50:00');
  });

  it('returns null when either side is unparseable', () => {
    expect(effectiveWindowMs('garbage', '2026-08-20 10:00:00', 0, 0)).toBeNull();
  });
});

describe('rangesOverlap', () => {
  const t = (s: string) => parseMpWallClockToUtcMs(s)!;

  it('detects a genuine overlap', () => {
    expect(rangesOverlap(t('2026-08-20 09:00:00'), t('2026-08-20 10:00:00'), t('2026-08-20 09:30:00'), t('2026-08-20 11:00:00'))).toBe(true);
  });

  it('treats back-to-back windows (end == start) as not overlapping', () => {
    expect(rangesOverlap(t('2026-08-20 09:00:00'), t('2026-08-20 10:00:00'), t('2026-08-20 10:00:00'), t('2026-08-20 11:00:00'))).toBe(false);
  });

  it('detects one window fully containing another', () => {
    expect(rangesOverlap(t('2026-08-20 08:00:00'), t('2026-08-20 12:00:00'), t('2026-08-20 09:00:00'), t('2026-08-20 10:00:00'))).toBe(true);
  });

  it('returns false for windows on different days', () => {
    expect(rangesOverlap(t('2026-08-20 09:00:00'), t('2026-08-20 10:00:00'), t('2026-08-21 09:00:00'), t('2026-08-21 10:00:00'))).toBe(false);
  });
});

describe('SpaceAvailabilityService', () => {
  beforeEach(() => {
    mockGetTableRecords.mockReset();
    mockCreateTableRecords.mockReset();
    mockSendMessage.mockReset();
    mockGetDomainInfo.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SpaceAvailabilityService as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DomainTimezoneService as any).instance = null;
    mockGetDomainInfo.mockResolvedValue({ TimeZoneName: 'America/Chicago' });
  });

  describe('getCurrentContact', () => {
    it('returns contact info when the User_GUID resolves', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 777 }])
        .mockResolvedValueOnce([{ Display_Name: 'Paul Goldsworthy', Email_Address: 'paul@example.com', Mobile_Phone: '555-1234' }]);

      const service = await SpaceAvailabilityService.getInstance();
      const contact = await service.getCurrentContact('some-guid');

      expect(contact).toEqual({ name: 'Paul Goldsworthy', email: 'paul@example.com', phone: '555-1234' });
    });

    it('returns null when the User_GUID does not resolve to a contact', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await SpaceAvailabilityService.getInstance();
      const contact = await service.getCurrentContact('unknown-guid');

      expect(contact).toBeNull();
    });
  });

  describe('getAvailability', () => {
    it('applies setup/cleanup to each returned block and respects show-detailed-info', async () => {
      mockGetTableRecords.mockResolvedValueOnce([
        {
          Room_ID: 10,
          Room_Name: 'Fellowship Hall',
          Event_Title: 'Parish Council Meeting',
          Event_Start_Date: '2026-08-20 09:00:00',
          Event_End_Date: '2026-08-20 10:00:00',
          Minutes_for_Setup: 15,
          Minutes_for_Cleanup: 30,
        },
      ]);

      const service = await SpaceAvailabilityService.getInstance();
      const blocks = await service.getAvailability({
        roomIds: [10],
        start: '2026-08-20T00:00:00.000Z',
        end: '2026-08-21T00:00:00.000Z',
        showDetailedInfo: true,
      });

      expect(blocks).toEqual([
        { Room_ID: 10, Room_Name: 'Fellowship Hall', Start: '2026-08-20 08:45:00', End: '2026-08-20 10:30:00', Event_Title: 'Parish Council Meeting' },
      ]);
    });

    it('nulls out Event_Title when showDetailedInfo is false', async () => {
      mockGetTableRecords.mockResolvedValueOnce([
        {
          Room_ID: 10,
          Room_Name: 'Fellowship Hall',
          Event_Title: 'Parish Council Meeting',
          Event_Start_Date: '2026-08-20 09:00:00',
          Event_End_Date: '2026-08-20 10:00:00',
          Minutes_for_Setup: 0,
          Minutes_for_Cleanup: 0,
        },
      ]);

      const service = await SpaceAvailabilityService.getInstance();
      const blocks = await service.getAvailability({
        roomIds: [10],
        start: '2026-08-20T00:00:00.000Z',
        end: '2026-08-21T00:00:00.000Z',
        showDetailedInfo: false,
      });

      expect(blocks[0].Event_Title).toBeNull();
    });

    it('returns an empty array without querying when no rooms are requested', async () => {
      const service = await SpaceAvailabilityService.getInstance();
      const blocks = await service.getAvailability({ roomIds: [], start: '2026-08-20T00:00:00.000Z', end: '2026-08-21T00:00:00.000Z', showDetailedInfo: true });
      expect(blocks).toEqual([]);
      expect(mockGetTableRecords).not.toHaveBeenCalled();
    });
  });

  describe('createReservationRequest', () => {
    const baseParams = {
      roomId: 10,
      date: '2026-08-20',
      startTime: '13:00',
      endTime: '14:00',
      setupMinutes: 15,
      cleanupMinutes: 15,
      requestorName: 'Paul Goldsworthy',
      requestorEmail: 'paul@example.com',
      userGuid: null,
      defaultContactId: 55,
      eventTypeId: 11,
      programId: 10,
      visibilityLevelId: 1,
      notifyEmails: ['office@example.com'],
    };

    it('rejects when the requested block conflicts with an existing booking', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Room_ID: 10, Room_Name: 'Fellowship Hall', Congregation_ID: 1, Building_Name: 'Parish Hall' }]) // room lookup
        .mockResolvedValueOnce([
          {
            Room_ID: 10,
            Room_Name: 'Fellowship Hall',
            Event_Title: 'Existing Meeting',
            Event_Start_Date: '2026-08-20 13:30:00',
            Event_End_Date: '2026-08-20 15:00:00',
            Minutes_for_Setup: 0,
            Minutes_for_Cleanup: 0,
          },
        ]); // existing bookings for the room

      const service = await SpaceAvailabilityService.getInstance();
      const result = await service.createReservationRequest(baseParams);

      expect(result.result).toBe('conflict');
      expect(mockCreateTableRecords).not.toHaveBeenCalled();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('creates Events then Event_Rooms and sends a notification when the block is free', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Room_ID: 10, Room_Name: 'Fellowship Hall', Congregation_ID: 1, Building_Name: 'Parish Hall' }]) // room lookup
        .mockResolvedValueOnce([]); // no existing bookings
      mockCreateTableRecords
        .mockResolvedValueOnce([{ Event_ID: 900 }])
        .mockResolvedValueOnce([{ Event_Room_ID: 950 }]);
      mockSendMessage.mockResolvedValueOnce({ CommunicationId: 1 });

      const service = await SpaceAvailabilityService.getInstance();
      const result = await service.createReservationRequest(baseParams);

      expect(result).toEqual({ result: 'ok', eventId: 900, eventRoomId: 950 });

      expect(mockCreateTableRecords).toHaveBeenNthCalledWith(
        1,
        'Events',
        [expect.objectContaining({ Congregation_ID: 1, Primary_Contact: 55, Event_Start_Date: '2026-08-20 13:00:00', Event_End_Date: '2026-08-20 14:00:00' })]
      );
      expect(mockCreateTableRecords).toHaveBeenNthCalledWith(
        2,
        'Event_Rooms',
        [expect.objectContaining({ Event_ID: 900, Room_ID: 10 })]
      );
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ ToAddresses: [{ DisplayName: 'office@example.com', Address: 'office@example.com' }] })
      );
    });

    it('uses the signed-in contact over the default when a userGuid resolves', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([{ Contact_ID: 777 }]) // dp_Users lookup
        .mockResolvedValueOnce([{ Room_ID: 10, Room_Name: 'Fellowship Hall', Congregation_ID: 1, Building_Name: 'Parish Hall' }])
        .mockResolvedValueOnce([]);
      mockCreateTableRecords
        .mockResolvedValueOnce([{ Event_ID: 901 }])
        .mockResolvedValueOnce([{ Event_Room_ID: 951 }]);

      const service = await SpaceAvailabilityService.getInstance();
      await service.createReservationRequest({ ...baseParams, userGuid: 'some-guid', notifyEmails: [] });

      expect(mockCreateTableRecords).toHaveBeenNthCalledWith(
        1,
        'Events',
        [expect.objectContaining({ Primary_Contact: 777 })]
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('errors when neither a signed-in contact nor a default contact is available', async () => {
      const service = await SpaceAvailabilityService.getInstance();
      const result = await service.createReservationRequest({ ...baseParams, defaultContactId: null });

      expect(result.result).toBe('error');
      expect(mockGetTableRecords).not.toHaveBeenCalled();
      expect(mockCreateTableRecords).not.toHaveBeenCalled();
    });
  });
});
