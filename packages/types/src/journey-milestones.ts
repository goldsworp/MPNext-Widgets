import { z } from "zod";

export const JourneyMilestoneSchema = z.object({
  Milestone_ID: z.number(),
  Milestone_Title: z.string(),
  Icon: z.string().nullable(),
  Sort_Order: z.number().nullable(),
  Achieved: z.boolean(),
  Date_Accomplished: z.string().nullable(),
  Form_ID: z.number().nullable(),
  Form_Title: z.string().nullable(),
  Form_GUID: z.string().nullable(),
  Event_ID: z.number().nullable(),
  Event_Title: z.string().nullable(),
});
export type JourneyMilestone = z.infer<typeof JourneyMilestoneSchema>;

export const JourneyMilestonesIndividualResponseSchema = z.object({
  milestones: z.array(JourneyMilestoneSchema),
});
export type JourneyMilestonesIndividualResponse = z.infer<typeof JourneyMilestonesIndividualResponseSchema>;

export const JourneyMilestoneFamilyMemberSchema = z.object({
  Participant_ID: z.number(),
  Contact_ID: z.number(),
  Display_Name: z.string(),
  Nickname: z.string().nullable(),
  First_Name: z.string().nullable(),
  Last_Name: z.string().nullable(),
  Milestones: z.array(JourneyMilestoneSchema),
});
export type JourneyMilestoneFamilyMember = z.infer<typeof JourneyMilestoneFamilyMemberSchema>;

export const JourneyMilestonesFamilyResponseSchema = z.object({
  members: z.array(JourneyMilestoneFamilyMemberSchema),
});
export type JourneyMilestonesFamilyResponse = z.infer<typeof JourneyMilestonesFamilyResponseSchema>;
