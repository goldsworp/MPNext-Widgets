import { describe, it, expect } from 'vitest';
import {
  PersonnelAssignmentSchema,
  PersonnelSummarySchema,
  PersonnelDirectoryResponseSchema,
  type PersonnelSummary,
} from './personnel-directory';

const validPerson: PersonnelSummary = {
  Personnel_ID: 1,
  Display_Name: 'Burberry, Fr. Webb',
  Personnel_Category_ID: 2,
  Personnel_Category: 'Clergy',
  Photo_URL: 'https://mp.example.com/ministryplatformapi/files/abc-123',
  Phone: '555-555-0266',
  Email: 'wburberry@example.com',
  Primary_Role: 'Pastor',
  Primary_Location: 'St. Leo',
  Primary_Congregation_ID: 1,
  Other_Assignments: [
    { Role: 'Pastor', Location: 'St. Joseph', Congregation_ID: 4 },
  ],
};

describe('PersonnelAssignmentSchema', () => {
  it('accepts a fully populated assignment', () => {
    expect(PersonnelAssignmentSchema.safeParse({ Role: 'Pastor', Location: 'St. Leo', Congregation_ID: 1 }).success).toBe(true);
  });

  it('accepts an assignment with no location', () => {
    expect(PersonnelAssignmentSchema.safeParse({ Role: 'Pastor', Location: null, Congregation_ID: null }).success).toBe(true);
  });

  it('rejects a missing Role key', () => {
    const partial = { Location: 'St. Leo', Congregation_ID: 1 };
    expect(PersonnelAssignmentSchema.safeParse(partial).success).toBe(false);
  });
});

describe('PersonnelSummarySchema', () => {
  it('accepts a fully populated person', () => {
    expect(PersonnelSummarySchema.safeParse(validPerson).success).toBe(true);
  });

  it('accepts a person with no photo, phone, email, or assignments', () => {
    const result = PersonnelSummarySchema.safeParse({
      ...validPerson,
      Photo_URL: null,
      Phone: null,
      Email: null,
      Primary_Role: null,
      Primary_Location: null,
      Primary_Congregation_ID: null,
      Other_Assignments: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing Personnel_Category', () => {
    const partial = { ...validPerson } as Record<string, unknown>;
    delete partial.Personnel_Category;
    expect(PersonnelSummarySchema.safeParse(partial).success).toBe(false);
  });

  it('rejects a string Personnel_ID', () => {
    expect(PersonnelSummarySchema.safeParse({ ...validPerson, Personnel_ID: '1' }).success).toBe(false);
  });
});

describe('PersonnelDirectoryResponseSchema', () => {
  it('accepts a response with multiple people', () => {
    const result = PersonnelDirectoryResponseSchema.safeParse({
      personnel: [validPerson, { ...validPerson, Personnel_ID: 2, Display_Name: 'Yushachkov, Fr. Montague' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty personnel array', () => {
    expect(PersonnelDirectoryResponseSchema.safeParse({ personnel: [] }).success).toBe(true);
  });

  it('fails when personnel is missing', () => {
    expect(PersonnelDirectoryResponseSchema.safeParse({}).success).toBe(false);
  });
});
