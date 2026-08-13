import { describe, it, expect } from 'vitest';
import {
  AdorationSlotSchema,
  PerpetualAdorationResponseSchema,
  PerpetualAdorationRegisterResponseSchema,
  type AdorationSlot,
} from './perpetual-adoration';

const validSlot: AdorationSlot = {
  Event_ID: 852,
  Event_Title: 'Perpetual Adoration - Sun 12:00 AM',
  Event_Start_Date: '2026-08-16T00:00:00',
  Event_End_Date: '2026-08-16T01:00:00',
  Congregation_ID: 4,
  Congregation_Name: 'St. Joseph',
  Registration_Active: true,
  Registrant_Count: 0,
  Slot_Status: 'Needs Adorer',
  First_Participant: null,
};

describe('AdorationSlotSchema', () => {
  it('accepts a fully populated open slot', () => {
    expect(AdorationSlotSchema.safeParse(validSlot).success).toBe(true);
  });

  it('accepts a committed slot with a participant name', () => {
    const result = AdorationSlotSchema.safeParse({
      ...validSlot,
      Registrant_Count: 1,
      Slot_Status: 'Adorer Committed',
      First_Participant: 'Goldsworthy, Paul',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid Slot_Status value', () => {
    const result = AdorationSlotSchema.safeParse({ ...validSlot, Slot_Status: 'Cancelled' });
    expect(result.success).toBe(false);
  });

  it('rejects a string Registrant_Count', () => {
    const result = AdorationSlotSchema.safeParse({ ...validSlot, Registrant_Count: 'zero' });
    expect(result.success).toBe(false);
  });

  it('fails when Congregation_Name is missing', () => {
    const partial = { ...validSlot } as Record<string, unknown>;
    delete partial.Congregation_Name;
    expect(AdorationSlotSchema.safeParse(partial).success).toBe(false);
  });
});

describe('PerpetualAdorationResponseSchema', () => {
  it('accepts a response with multiple slots', () => {
    const result = PerpetualAdorationResponseSchema.safeParse({
      slots: [validSlot, { ...validSlot, Event_ID: 853, Slot_Status: 'Adorer Committed', Registrant_Count: 1, First_Participant: 'Herzing, Katie' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty slots array', () => {
    expect(PerpetualAdorationResponseSchema.safeParse({ slots: [] }).success).toBe(true);
  });

  it('fails when slots is missing', () => {
    expect(PerpetualAdorationResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('PerpetualAdorationRegisterResponseSchema', () => {
  it('accepts a successful registration result', () => {
    const result = PerpetualAdorationRegisterResponseSchema.safeParse({
      result: 'ok',
      participantId: 42,
      requestedCount: 2,
      registeredCount: 2,
      registeredEventIds: [852, 853],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an error result with a message and no participantId', () => {
    const result = PerpetualAdorationRegisterResponseSchema.safeParse({
      result: 'error',
      message: 'Could not identify the signed-in participant.',
      requestedCount: 0,
      registeredCount: 0,
      registeredEventIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid result value', () => {
    const result = PerpetualAdorationRegisterResponseSchema.safeParse({
      result: 'maybe',
      requestedCount: 0,
      registeredCount: 0,
      registeredEventIds: [],
    });
    expect(result.success).toBe(false);
  });
});
