import { z } from "zod";

export const SpaceCongregationSchema = z.object({
  Congregation_ID: z.number(),
  Congregation_Name: z.string(),
});
export type SpaceCongregation = z.infer<typeof SpaceCongregationSchema>;

export const SpaceBuildingSchema = z.object({
  Building_ID: z.number(),
  Building_Name: z.string(),
});
export type SpaceBuilding = z.infer<typeof SpaceBuildingSchema>;

export const SpaceRoomSchema = z.object({
  Room_ID: z.number(),
  Room_Name: z.string(),
  Room_Number: z.string().nullable(),
  Maximum_Capacity: z.number().nullable(),
});
export type SpaceRoom = z.infer<typeof SpaceRoomSchema>;

// Start/End are MP-domain wall-clock strings ("YYYY-MM-DD HH:MM:SS") with
// setup/cleanup minutes already applied — the widget displays them as-is,
// no further timezone conversion needed. Event_Title is null when the
// widget is configured for busy/free-only display.
export const AvailabilityBlockSchema = z.object({
  Room_ID: z.number(),
  Room_Name: z.string(),
  Start: z.string(),
  End: z.string(),
  Event_Title: z.string().nullable(),
});
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>;

export const SpaceAvailabilityResponseSchema = z.object({
  blocks: z.array(AvailabilityBlockSchema),
});
export type SpaceAvailabilityResponse = z.infer<typeof SpaceAvailabilityResponseSchema>;

export const ReservationRequestInputSchema = z.object({
  roomId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM"),
  setupMinutes: z.number().int().min(0).max(1440),
  cleanupMinutes: z.number().int().min(0).max(1440),
  requestorName: z.string().min(1).max(125),
  requestorEmail: z.string().email(),
  requestorPhone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
});
export type ReservationRequestInput = z.infer<typeof ReservationRequestInputSchema>;

export const ReservationRequestResultSchema = z.object({
  result: z.enum(["ok", "conflict", "error"]),
  message: z.string().optional(),
  eventId: z.number().optional(),
  eventRoomId: z.number().optional(),
});
export type ReservationRequestResult = z.infer<typeof ReservationRequestResultSchema>;
