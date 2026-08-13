import { z } from "zod";

export const MassEventSchema = z.object({
  Event_ID: z.number(),
  Event_Title: z.string(),
  Event_Start_Date: z.string(),
  Event_End_Date: z.string(),
  Congregation_ID: z.number(),
  Congregation_Name: z.string(),
  Registration_Active: z.boolean(),
  Registrant_Count: z.number(),
  Intention_Status: z.enum(["Available", "Reserved", "Past"]),
});
export type MassEvent = z.infer<typeof MassEventSchema>;

export const MassIntentionCalendarResponseSchema = z.object({
  events: z.array(MassEventSchema),
});
export type MassIntentionCalendarResponse = z.infer<typeof MassIntentionCalendarResponseSchema>;
