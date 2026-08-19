import { describe, it, expect } from 'vitest';
import {
  OrganizationSummarySchema,
  OrganizationDirectoryResponseSchema,
  MassScheduleEntrySchema,
  OrganizationDetailSchema,
  type OrganizationSummary,
  type OrganizationDetail,
} from './organization-directory';

const validSummary: OrganizationSummary = {
  Congregation_ID: 1,
  Name: 'St. Leo',
  Description: 'A traditional Catholic church with a vibrant and active community.',
  Location_Category_ID: 1,
  Location_Category: 'Parish',
  Location_Group_ID: 1,
  Location_Group: 'North Deanery',
  Address_Line_1: '3140 N 51st Ave',
  Address_Line_2: null,
  City: 'Phoenix',
  State: 'AZ',
  Postal_Code: '85031',
  Phone: '555-555-3220',
  Latitude: 33.4859319,
  Longitude: -112.1717872,
  Logo_URL: 'https://mp.example.com/ministryplatformapi/files/abc-123',
  Giving_URL: 'https://mkt.ministryplatform.com/portal/online_giving.aspx',
};

describe('OrganizationSummarySchema', () => {
  it('accepts a fully populated organization', () => {
    expect(OrganizationSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it('accepts an organization with no group, logo, or coordinates', () => {
    const result = OrganizationSummarySchema.safeParse({
      ...validSummary,
      Location_Group_ID: null,
      Location_Group: null,
      Latitude: null,
      Longitude: null,
      Logo_URL: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing Location_Category', () => {
    const partial = { ...validSummary } as Record<string, unknown>;
    delete partial.Location_Category;
    expect(OrganizationSummarySchema.safeParse(partial).success).toBe(false);
  });

  it('rejects a string Latitude', () => {
    const result = OrganizationSummarySchema.safeParse({ ...validSummary, Latitude: '33.48' });
    expect(result.success).toBe(false);
  });
});

describe('OrganizationDirectoryResponseSchema', () => {
  it('accepts a response with multiple organizations', () => {
    const result = OrganizationDirectoryResponseSchema.safeParse({
      organizations: [validSummary, { ...validSummary, Congregation_ID: 2, Name: 'San Junípero Serra' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty organizations array', () => {
    expect(OrganizationDirectoryResponseSchema.safeParse({ organizations: [] }).success).toBe(true);
  });

  it('fails when organizations is missing', () => {
    expect(OrganizationDirectoryResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('MassScheduleEntrySchema', () => {
  it('accepts a valid schedule entry', () => {
    const result = MassScheduleEntrySchema.safeParse({
      Day_Of_Week: 'Sunday',
      Day_Of_Week_Number: 0,
      Time_Label: '9:00 AM',
      Event_Title: 'Sunday 9AM Mass',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing Time_Label', () => {
    const partial = {
      Day_Of_Week: 'Sunday',
      Day_Of_Week_Number: 0,
      Event_Title: 'Sunday 9AM Mass',
    };
    expect(MassScheduleEntrySchema.safeParse(partial).success).toBe(false);
  });
});

describe('OrganizationDetailSchema', () => {
  const validDetail: OrganizationDetail = {
    ...validSummary,
    Pastor_Name: 'Winckles, Fr. Benn',
    Mass_Schedule: [
      { Day_Of_Week: 'Sunday', Day_Of_Week_Number: 0, Time_Label: '9:00 AM', Event_Title: 'Sunday 9AM Mass' },
    ],
  };

  it('accepts a fully populated detail record', () => {
    expect(OrganizationDetailSchema.safeParse(validDetail).success).toBe(true);
  });

  it('accepts an empty Mass_Schedule (no Mass events published)', () => {
    const result = OrganizationDetailSchema.safeParse({ ...validDetail, Mass_Schedule: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a null Pastor_Name', () => {
    const result = OrganizationDetailSchema.safeParse({ ...validDetail, Pastor_Name: null });
    expect(result.success).toBe(true);
  });

  it('rejects a missing Mass_Schedule', () => {
    const partial = { ...validDetail } as Record<string, unknown>;
    delete partial.Mass_Schedule;
    expect(OrganizationDetailSchema.safeParse(partial).success).toBe(false);
  });
});
