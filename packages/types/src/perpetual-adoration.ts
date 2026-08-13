import { z } from "zod";

export const AdorationSlotSchema = z.object({
  Event_ID: z.number(),
  Event_Title: z.string(),
  Event_Start_Date: z.string(),
  Event_End_Date: z.string(),
  Congregation_ID: z.number(),
  Congregation_Name: z.string(),
  Registration_Active: z.boolean(),
  Registrant_Count: z.number(),
  Slot_Status: z.enum(["Needs Adorer", "Adorer Committed"]),
  First_Participant: z.string().nullable(),
});
export type AdorationSlot = z.infer<typeof AdorationSlotSchema>;

export const PerpetualAdorationResponseSchema = z.object({
  slots: z.array(AdorationSlotSchema),
});
export type PerpetualAdorationResponse = z.infer<typeof PerpetualAdorationResponseSchema>;

export const PerpetualAdorationRegisterResponseSchema = z.object({
  result: z.enum(["ok", "error"]),
  message: z.string().optional(),
  participantId: z.number().optional(),
  requestedCount: z.number(),
  registeredCount: z.number(),
  registeredEventIds: z.array(z.number()),
});
export type PerpetualAdorationRegisterResponse = z.infer<typeof PerpetualAdorationRegisterResponseSchema>;
