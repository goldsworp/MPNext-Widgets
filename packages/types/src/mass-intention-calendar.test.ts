import { describe, it, expect } from 'vitest';
import {
  MassEventSchema,
  MassIntentionCalendarResponseSchema,
  type MassEvent,
} from './mass-intention-calendar';

const validEvent: MassEvent = {
  Event_ID: 752,
  Event_Title: 'Daily 7AM Mass',
  Event_Start_Date: '2026-08-12T07:00:00',
  Event_End_Date: '2026-08-12T07:30:00',
  Congregation_ID: 4,
  Congregation_Name: 'St. Joseph',
  Registration_Active: true,
  Registrant_Count: 0,
  Intention_Status: 'Available',
};

describe('MassEventSchema', () => {
  it('accepts a fully populated event', () => {
    expect(MassEventSchema.safeParse(validEvent).success).toBe(true);
  });

  it('accepts each Intention_Status value', () => {
    for (const status of ['Available', 'Reserved', 'Past']) {
      expect(MassEventSchema.safeParse({ ...validEvent, Intention_Status: status }).success).toBe(true);
    }
  });

  it('rejects an invalid Intention_Status value', () => {
    const result = MassEventSchema.safeParse({ ...validEvent, Intention_Status: 'Cancelled' });
    expect(result.success).toBe(false);
  });

  it('rejects a string Registrant_Count', () => {
    const result = MassEventSchema.safeParse({ ...validEvent, Registrant_Count: 'zero' });
    expect(result.success).toBe(false);
  });

  it('fails when Congregation_Name is missing', () => {
    const partial = { ...validEvent } as Record<string, unknown>;
    delete partial.Congregation_Name;
    expect(MassEventSchema.safeParse(partial).success).toBe(false);
  });
});

describe('MassIntentionCalendarResponseSchema', () => {
  it('accepts a response with multiple events', () => {
    const result = MassIntentionCalendarResponseSchema.safeParse({
      events: [validEvent, { ...validEvent, Event_ID: 753, Intention_Status: 'Reserved', Registrant_Count: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty events array', () => {
    expect(MassIntentionCalendarResponseSchema.safeParse({ events: [] }).success).toBe(true);
  });

  it('fails when events is missing', () => {
    expect(MassIntentionCalendarResponseSchema.safeParse({}).success).toBe(false);
  });
});
