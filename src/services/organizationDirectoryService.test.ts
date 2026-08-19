import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords, mockGetFilesByRecord, mockGetDomainInfo } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockGetFilesByRecord: vi.fn(),
  mockGetDomainInfo: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      getFilesByRecord = mockGetFilesByRecord;
      getDomainInfo = mockGetDomainInfo;
    },
  };
});

import { OrganizationDirectoryService } from '@/services/organizationDirectoryService';
import { DomainTimezoneService } from '@/services/domainTimezoneService';

describe('OrganizationDirectoryService', () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so mockResolvedValueOnce queues drain.
    mockGetTableRecords.mockReset();
    mockGetFilesByRecord.mockReset();
    mockGetDomainInfo.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (OrganizationDirectoryService as any).instance = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DomainTimezoneService as any).instance = null;
    mockGetFilesByRecord.mockResolvedValue([]);
    mockGetDomainInfo.mockResolvedValue({ TimeZoneName: 'America/Phoenix' });
  });

  describe('getInstance', () => {
    it('returns a singleton instance', async () => {
      const instance1 = await OrganizationDirectoryService.getInstance();
      const instance2 = await OrganizationDirectoryService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getOrganizations', () => {
    const baseRow = {
      Congregation_ID: 1,
      Name: 'St. Leo',
      Description: 'A traditional Catholic church.',
      Location_Category_ID: 1,
      Location_Category: 'Parish',
      Location_Group_ID: 1,
      Location_Group: 'North Deanery',
      Phone: '555-555-3220',
      Address_Line_1: '3140 N 51st Ave',
      Address_Line_2: null,
      City: 'Phoenix',
      State: 'AZ',
      Postal_Code: '85031',
      Latitude: '33.4859319',
      Longitude: '-112.1717872',
      Giving_URL: 'https://mkt.ministryplatform.com/portal/online_giving.aspx',
    };

    it('returns an empty array when no organizations match', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizations({});

      expect(result).toEqual([]);
    });

    it('maps a row into an OrganizationSummary with numeric coordinates', async () => {
      mockGetTableRecords.mockResolvedValueOnce([baseRow]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizations({});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        Congregation_ID: 1,
        Name: 'St. Leo',
        Location_Category: 'Parish',
        Latitude: 33.4859319,
        Longitude: -112.1717872,
        Logo_URL: null,
      });
    });

    it('resolves a Logo_URL when the congregation has a default image attachment', async () => {
      mockGetTableRecords.mockResolvedValueOnce([baseRow]);
      mockGetFilesByRecord.mockResolvedValueOnce([{ UniqueFileId: 'abc-123', IsImage: true }]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizations({});

      expect(result[0].Logo_URL).toContain('abc-123');
    });

    it('leaves Logo_URL null when the attachment is not an image', async () => {
      mockGetTableRecords.mockResolvedValueOnce([baseRow]);
      mockGetFilesByRecord.mockResolvedValueOnce([{ UniqueFileId: 'doc-1', IsImage: false }]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizations({});

      expect(result[0].Logo_URL).toBeNull();
    });

    it('handles a row with no Location record (null category/coordinates)', async () => {
      mockGetTableRecords.mockResolvedValueOnce([
        { ...baseRow, Location_Category_ID: null, Location_Category: null, Latitude: null, Longitude: null },
      ]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizations({});

      expect(result[0].Location_Category).toBeNull();
      expect(result[0].Latitude).toBeNull();
    });

    it('always applies the Available_Online / End_Date / Coming_Soon visibility filter', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await service.getOrganizations({});

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('Congregations.Available_Online = 1'),
        })
      );
    });

    it('includes a category filter when locationCategoryIds is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await service.getOrganizations({ locationCategoryIds: [1, 9] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('Location_ID_TABLE.Location_Category_ID IN (1,9)'),
        })
      );
    });

    it('omits the category filter when none is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await service.getOrganizations({});

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.not.stringContaining('Location_Category_ID IN'),
        })
      );
    });

    it('includes a congregation filter when congregationIds is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await service.getOrganizations({ congregationIds: [4, 8] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('Congregations.Congregation_ID IN (4,8)'),
        })
      );
    });
  });

  describe('getOrganizationDetail', () => {
    const detailRow = {
      Congregation_ID: 1,
      Name: 'St. Leo',
      Description: 'A traditional Catholic church.',
      Location_Category_ID: 1,
      Location_Category: 'Parish',
      Location_Group_ID: 1,
      Location_Group: 'North Deanery',
      Phone: '555-555-3220',
      City: 'Phoenix',
      State: 'AZ',
      Postal_Code: '85031',
      Latitude: '33.4859319',
      Longitude: '-112.1717872',
      Giving_URL: 'https://mkt.ministryplatform.com/portal/online_giving.aspx',
      Address_Line_1: '3140 N 51st Ave',
      Address_Line_2: null,
      Pastor_Name: 'Winckles, Fr. Benn',
    };

    it('throws "Organization not found" when the congregation does not match', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await expect(service.getOrganizationDetail(999)).rejects.toThrow('Organization not found');
    });

    it('returns detail with an empty Mass_Schedule when massEventTypeId is omitted, without querying Events', async () => {
      mockGetTableRecords.mockResolvedValueOnce([detailRow]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizationDetail(1);

      expect(result.Pastor_Name).toBe('Winckles, Fr. Benn');
      expect(result.Mass_Schedule).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('builds a deduplicated weekly Mass schedule from upcoming events', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([detailRow])
        .mockResolvedValueOnce([
          { Event_Start_Date: '2026-08-16T09:00:00', Event_Title: 'Sunday 9AM Mass' },
          { Event_Start_Date: '2026-08-23T09:00:00', Event_Title: 'Sunday 9AM Mass' }, // same day+time next week — deduped
          { Event_Start_Date: '2026-08-16T11:00:00', Event_Title: 'Sunday 11AM Mass' },
          { Event_Start_Date: '2026-08-15T17:00:00', Event_Title: 'Saturday 5PM Mass' },
        ]);

      const service = await OrganizationDirectoryService.getInstance();
      const result = await service.getOrganizationDetail(1, 13);

      expect(result.Mass_Schedule).toEqual([
        { Day_Of_Week: 'Saturday', Day_Of_Week_Number: 6, Time_Label: '5:00 PM', Event_Title: 'Saturday 5PM Mass' },
        { Day_Of_Week: 'Sunday', Day_Of_Week_Number: 0, Time_Label: '9:00 AM', Event_Title: 'Sunday 9AM Mass' },
        { Day_Of_Week: 'Sunday', Day_Of_Week_Number: 0, Time_Label: '11:00 AM', Event_Title: 'Sunday 11AM Mass' },
      ]);
    });

    it('filters Events on the given massEventTypeId and this congregation', async () => {
      mockGetTableRecords.mockResolvedValueOnce([detailRow]).mockResolvedValueOnce([]);

      const service = await OrganizationDirectoryService.getInstance();
      await service.getOrganizationDetail(1, 13);

      expect(mockGetTableRecords).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          filter: expect.stringMatching(/Congregation_ID = 1.*Event_Type_ID = 13/),
        })
      );
    });
  });
});
