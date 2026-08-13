import { z } from "zod";

export const FaithFormationLeaderSchema = z.object({
  Contact_ID: z.number(),
  Display_Name: z.string(),
  Photo_URL: z.string().nullable(),
  Role_Title: z.string(),
  Mobile_Phone: z.string().nullable(),
  Email_Address: z.string().nullable(),
});
export type FaithFormationLeader = z.infer<typeof FaithFormationLeaderSchema>;

export const FaithFormationMeetingSchema = z.object({
  Event_ID: z.number(),
  Event_Title: z.string(),
  Event_Start_Date: z.string(),
  Event_End_Date: z.string(),
  Participation_Status_ID: z.number().nullable(),
  Is_Present: z.boolean().nullable(),
});
export type FaithFormationMeeting = z.infer<typeof FaithFormationMeetingSchema>;

export const FaithFormationCurrentGroupSchema = z.object({
  Group_Participant_ID: z.number(),
  Group_ID: z.number(),
  Group_Name: z.string(),
  Participant_Start_Date: z.string(),
  Participant_End_Date: z.string().nullable(),
  Leaders: z.array(FaithFormationLeaderSchema),
  UpcomingMeetings: z.array(FaithFormationMeetingSchema),
  PastMeetings: z.array(FaithFormationMeetingSchema),
});
export type FaithFormationCurrentGroup = z.infer<typeof FaithFormationCurrentGroupSchema>;

export const FaithFormationPastGroupSchema = z.object({
  Group_Participant_ID: z.number(),
  Group_ID: z.number(),
  Group_Name: z.string(),
  Participant_Start_Date: z.string(),
  Participant_End_Date: z.string().nullable(),
  Total_Meetings: z.number(),
  Attended_Meetings: z.number(),
  Leaders: z.array(FaithFormationLeaderSchema),
  Meetings: z.array(FaithFormationMeetingSchema),
});
export type FaithFormationPastGroup = z.infer<typeof FaithFormationPastGroupSchema>;

export const FaithFormationPersonSchema = z.object({
  Contact_ID: z.number(),
  Display_Name: z.string(),
  Photo_URL: z.string().nullable(),
  CurrentGroups: z.array(FaithFormationCurrentGroupSchema),
  PastGroups: z.array(FaithFormationPastGroupSchema),
});
export type FaithFormationPerson = z.infer<typeof FaithFormationPersonSchema>;

export const FaithFormationResponseSchema = z.object({
  people: z.array(FaithFormationPersonSchema),
});
export type FaithFormationResponse = z.infer<typeof FaithFormationResponseSchema>;
