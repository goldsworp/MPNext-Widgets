import { z } from "zod";

export const PersonnelAssignmentSchema = z.object({
  Role: z.string().nullable(),
  Location: z.string().nullable(),
  Congregation_ID: z.number().nullable(),
});
export type PersonnelAssignment = z.infer<typeof PersonnelAssignmentSchema>;

export const PersonnelSummarySchema = z.object({
  Personnel_ID: z.number(),
  Display_Name: z.string(),
  Personnel_Category_ID: z.number(),
  Personnel_Category: z.string(),
  Photo_URL: z.string().nullable(),
  Phone: z.string().nullable(),
  Email: z.string().nullable(),
  Primary_Role: z.string().nullable(),
  Primary_Location: z.string().nullable(),
  Primary_Congregation_ID: z.number().nullable(),
  Other_Assignments: z.array(PersonnelAssignmentSchema),
});
export type PersonnelSummary = z.infer<typeof PersonnelSummarySchema>;

export const PersonnelDirectoryResponseSchema = z.object({
  personnel: z.array(PersonnelSummarySchema),
});
export type PersonnelDirectoryResponse = z.infer<typeof PersonnelDirectoryResponseSchema>;
