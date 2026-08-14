import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetTableRecords, mockGetFilesByRecord } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockGetFilesByRecord: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      getFilesByRecord = mockGetFilesByRecord;
    },
  };
});

import { PersonnelDirectoryService } from '@/services/personnelDirectoryService';

describe('PersonnelDirectoryService', () => {
  beforeEach(() => {
    // mockReset (not clearAllMocks) so mockResolvedValueOnce queues drain.
    mockGetTableRecords.mockReset();
    mockGetFilesByRecord.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PersonnelDirectoryService as any).instance = undefined;
    mockGetFilesByRecord.mockResolvedValue([]);
  });

  describe('getInstance', () => {
    it('returns a singleton instance', async () => {
      const instance1 = await PersonnelDirectoryService.getInstance();
      const instance2 = await PersonnelDirectoryService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getPersonnel', () => {
    // Personnel_Category is deliberately absent — the service no longer
    // queries it (Personnel_Categories is a System Lookup it can't be
    // granted Read access to); the category name comes from a hardcoded
    // map keyed on Personnel_Category_ID instead.
    const baseRow = {
      Personnel_ID: 1,
      Display_Name: 'Burberry, Fr. Webb',
      Email_Address: 'wburberry@example.com',
      Company_Phone: '555-100-0001',
      Mobile_Phone: '555-200-0002',
      Personnel_Category_ID: 2,
      Contact_ID: 10,
    };

    it('returns an empty array when no personnel match, without querying assignments', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await PersonnelDirectoryService.getInstance();
      const result = await service.getPersonnel({});

      expect(result).toEqual([]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('picks the first Primary_Assignment as primary and lists the rest as other assignments', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseRow])
        .mockResolvedValueOnce([
          { Personnel_Assignment_ID: 1, Personnel_ID: 1, Primary_Assignment: true, Assignment_Role: 'Pastor', Location_Name: 'St. Leo', Location_Phone: null, Congregation_ID: 1 },
          { Personnel_Assignment_ID: 2, Personnel_ID: 1, Primary_Assignment: false, Assignment_Role: 'Pastor', Location_Name: 'St. Joseph', Location_Phone: null, Congregation_ID: 4 },
        ]);

      const service = await PersonnelDirectoryService.getInstance();
      const result = await service.getPersonnel({});

      expect(result[0].Primary_Role).toBe('Pastor');
      expect(result[0].Primary_Location).toBe('St. Leo');
      expect(result[0].Primary_Congregation_ID).toBe(1);
      expect(result[0].Other_Assignments).toEqual([
        { Role: 'Pastor', Location: 'St. Joseph', Congregation_ID: 4 },
      ]);
    });

    it('treats a second row also flagged Primary_Assignment as an other assignment', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([baseRow])
        .mockResolvedValueOnce([
          { Personnel_Assignment_ID: 1, Personnel_ID: 1, Primary_Assignment: true, Assignment_Role: 'Pastor', Location_Name: 'St. Leo', Location_Phone: null, Congregation_ID: 1 },
          { Personnel_Assignment_ID: 2, Personnel_ID: 1, Primary_Assignment: true, Assignment_Role: 'Pastor', Location_Name: 'Our Lady of Lavang', Location_Phone: null, Congregation_ID: 8 },
        ]);

      const service = await PersonnelDirectoryService.getInstance();
      const result = await service.getPersonnel({});

      expect(result[0].Primary_Location).toBe('St. Leo');
      expect(result[0].Other_Assignments).toHaveLength(1);
      expect(result[0].Other_Assignments[0].Location).toBe('Our Lady of Lavang');
    });

    it('handles a person with no active assignments', async () => {
      mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]);

      const service = await PersonnelDirectoryService.getInstance();
      const result = await service.getPersonnel({});

      expect(result[0].Primary_Role).toBeNull();
      expect(result[0].Primary_Location).toBeNull();
      expect(result[0].Other_Assignments).toEqual([]);
    });

    describe('category name resolution', () => {
      it('maps Personnel_Category_ID to a name via the hardcoded lookup, not a query join', async () => {
        mockGetTableRecords.mockResolvedValueOnce([{ ...baseRow, Personnel_Category_ID: 5 }]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({});
        expect(result[0].Personnel_Category).toBe('Volunteer');
      });

      it('falls back to a generic label for an unmapped category ID', async () => {
        mockGetTableRecords.mockResolvedValueOnce([{ ...baseRow, Personnel_Category_ID: 99 }]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({});
        expect(result[0].Personnel_Category).toBe('Category 99');
      });
    });

    describe('phone resolution', () => {
      it('defaults to Company Phone (source 1)', async () => {
        mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({});
        expect(result[0].Phone).toBe('555-100-0001');
      });

      it('uses Mobile Phone when phoneSource is 3', async () => {
        mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ phoneSource: 3 });
        expect(result[0].Phone).toBe('555-200-0002');
      });

      it('falls back to another source when the configured one is blank', async () => {
        mockGetTableRecords
          .mockResolvedValueOnce([{ ...baseRow, Company_Phone: null }])
          .mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ phoneSource: 1 });
        expect(result[0].Phone).toBe('555-200-0002');
      });

      it('returns null instead of falling back when phoneStrictSource is true', async () => {
        mockGetTableRecords
          .mockResolvedValueOnce([{ ...baseRow, Company_Phone: null }])
          .mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ phoneSource: 1, phoneStrictSource: true });
        expect(result[0].Phone).toBeNull();
      });

      it('uses the primary assignment location Phone when phoneSource is 2', async () => {
        mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([
          { Personnel_Assignment_ID: 1, Personnel_ID: 1, Primary_Assignment: true, Assignment_Role: 'Pastor', Location_Name: 'St. Leo', Location_Phone: '555-300-0003', Congregation_ID: 1 },
        ]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ phoneSource: 2 });
        expect(result[0].Phone).toBe('555-300-0003');
      });
    });

    describe('email resolution', () => {
      it('uses the Contact email when no alternateEmailTypeId is given', async () => {
        mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({});
        expect(result[0].Email).toBe('wburberry@example.com');
      });

      it('prefers the alternate email when found', async () => {
        mockGetTableRecords
          .mockResolvedValueOnce([baseRow])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ Contact_ID: 10, Email_Address: 'official@diocese.example.org' }]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ alternateEmailTypeId: 1 });
        expect(result[0].Email).toBe('official@diocese.example.org');
      });

      it('falls back to the Contact email when no alternate email is found', async () => {
        mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        const service = await PersonnelDirectoryService.getInstance();
        const result = await service.getPersonnel({ alternateEmailTypeId: 1 });
        expect(result[0].Email).toBe('wburberry@example.com');
      });
    });

    it('resolves a Photo_URL when the contact has a default image attachment', async () => {
      mockGetTableRecords.mockResolvedValueOnce([baseRow]).mockResolvedValueOnce([]);
      mockGetFilesByRecord.mockResolvedValueOnce([{ UniqueFileId: 'photo-123', IsImage: true }]);

      const service = await PersonnelDirectoryService.getInstance();
      const result = await service.getPersonnel({});

      expect(result[0].Photo_URL).toContain('photo-123');
    });

    it('includes a category filter when personnelCategoryIds is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);
      const service = await PersonnelDirectoryService.getInstance();
      await service.getPersonnel({ personnelCategoryIds: [2, 3] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.stringContaining('Personnel.Personnel_Category_ID IN (2,3)') })
      );
    });

    it('includes a congregation filter when congregationIds is provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);
      const service = await PersonnelDirectoryService.getInstance();
      await service.getPersonnel({ congregationIds: [1, 4] });

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.stringContaining('Personnel.Congregation_ID IN (1,4)') })
      );
    });

    it('always filters to active (non-ended, non-terminated) personnel', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);
      const service = await PersonnelDirectoryService.getInstance();
      await service.getPersonnel({});

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: expect.stringContaining('Personnel.Termination_Date IS NULL') })
      );
    });
  });
});
