import { describe, it, expect } from 'vitest';
import {
  SpaceCongregationSchema,
  SpaceBuildingSchema,
  SpaceRoomSchema,
  AvailabilityBlockSchema,
  SpaceAvailabilityResponseSchema,
  ReservationRequestInputSchema,
  ReservationRequestResultSchema,
} from './space-availability';

describe('SpaceCongregationSchema', () => {
  it('accepts a valid congregation', () => {
    expect(SpaceCongregationSchema.safeParse({ Congregation_ID: 1, Congregation_Name: 'St. Leo' }).success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(SpaceCongregationSchema.safeParse({ Congregation_ID: 1 }).success).toBe(false);
  });
});

describe('SpaceBuildingSchema', () => {
  it('accepts a valid building', () => {
    expect(SpaceBuildingSchema.safeParse({ Building_ID: 3, Building_Name: 'Parish Hall' }).success).toBe(true);
  });
});

describe('SpaceRoomSchema', () => {
  const validRoom = { Room_ID: 10, Room_Name: 'Fellowship Hall', Room_Number: 'A1', Maximum_Capacity: 120 };

  it('accepts a fully populated room', () => {
    expect(SpaceRoomSchema.safeParse(validRoom).success).toBe(true);
  });

  it('accepts null Room_Number and Maximum_Capacity', () => {
    const result = SpaceRoomSchema.safeParse({ ...validRoom, Room_Number: null, Maximum_Capacity: null });
    expect(result.success).toBe(true);
  });

  it('rejects a missing Room_Name', () => {
    const partial = { ...validRoom } as Record<string, unknown>;
    delete partial.Room_Name;
    expect(SpaceRoomSchema.safeParse(partial).success).toBe(false);
  });
});

describe('AvailabilityBlockSchema', () => {
  const validBlock = {
    Room_ID: 10,
    Room_Name: 'Fellowship Hall',
    Start: '2026-08-20 08:45:00',
    End: '2026-08-20 10:15:00',
    Event_Title: 'Parish Council Meeting',
  };

  it('accepts a detailed block with an event title', () => {
    expect(AvailabilityBlockSchema.safeParse(validBlock).success).toBe(true);
  });

  it('accepts a busy/free-only block with a null event title', () => {
    expect(AvailabilityBlockSchema.safeParse({ ...validBlock, Event_Title: null }).success).toBe(true);
  });

  it('rejects a missing Start', () => {
    const partial = { ...validBlock } as Record<string, unknown>;
    delete partial.Start;
    expect(AvailabilityBlockSchema.safeParse(partial).success).toBe(false);
  });
});

describe('SpaceAvailabilityResponseSchema', () => {
  it('accepts an empty blocks array', () => {
    expect(SpaceAvailabilityResponseSchema.safeParse({ blocks: [] }).success).toBe(true);
  });

  it('fails when blocks is missing', () => {
    expect(SpaceAvailabilityResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('ReservationRequestInputSchema', () => {
  const validInput = {
    roomId: 10,
    date: '2026-08-20',
    startTime: '09:00',
    endTime: '10:00',
    setupMinutes: 15,
    cleanupMinutes: 15,
    requestorName: 'Paul Goldsworthy',
    requestorEmail: 'paul@example.com',
    requestorPhone: '555-123-4567',
    notes: 'Weekly council meeting',
  };

  it('accepts a fully populated request', () => {
    expect(ReservationRequestInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('accepts a request with optional fields omitted', () => {
    const { requestorPhone: _requestorPhone, notes: _notes, ...minimal } = validInput;
    expect(ReservationRequestInputSchema.safeParse(minimal).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(ReservationRequestInputSchema.safeParse({ ...validInput, date: '08/20/2026' }).success).toBe(false);
  });

  it('rejects a malformed time', () => {
    expect(ReservationRequestInputSchema.safeParse({ ...validInput, startTime: '9:00 AM' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(ReservationRequestInputSchema.safeParse({ ...validInput, requestorEmail: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a negative setupMinutes', () => {
    expect(ReservationRequestInputSchema.safeParse({ ...validInput, setupMinutes: -5 }).success).toBe(false);
  });
});

describe('ReservationRequestResultSchema', () => {
  it('accepts a successful result', () => {
    const result = ReservationRequestResultSchema.safeParse({ result: 'ok', eventId: 100, eventRoomId: 200 });
    expect(result.success).toBe(true);
  });

  it('accepts a conflict result with just a message', () => {
    const result = ReservationRequestResultSchema.safeParse({ result: 'conflict', message: 'Already booked.' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid result value', () => {
    expect(ReservationRequestResultSchema.safeParse({ result: 'maybe' }).success).toBe(false);
  });
});
