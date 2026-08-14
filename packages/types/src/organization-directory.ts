import { z } from "zod";

export const OrganizationSummarySchema = z.object({
  Congregation_ID: z.number(),
  Name: z.string(),
  Description: z.string().nullable(),
  Location_Category_ID: z.number().nullable(),
  Location_Category: z.string().nullable(),
  Location_Group_ID: z.number().nullable(),
  Location_Group: z.string().nullable(),
  City: z.string().nullable(),
  State: z.string().nullable(),
  Postal_Code: z.string().nullable(),
  Phone: z.string().nullable(),
  Latitude: z.number().nullable(),
  Longitude: z.number().nullable(),
  Logo_URL: z.string().nullable(),
  Giving_URL: z.string().nullable(),
});
export type OrganizationSummary = z.infer<typeof OrganizationSummarySchema>;

export const OrganizationDirectoryResponseSchema = z.object({
  organizations: z.array(OrganizationSummarySchema),
});
export type OrganizationDirectoryResponse = z.infer<typeof OrganizationDirectoryResponseSchema>;

export const MassScheduleEntrySchema = z.object({
  Day_Of_Week: z.string(),
  Day_Of_Week_Number: z.number(),
  Time_Label: z.string(),
  Event_Title: z.string(),
});
export type MassScheduleEntry = z.infer<typeof MassScheduleEntrySchema>;

export const OrganizationDetailSchema = OrganizationSummarySchema.extend({
  Address_Line_1: z.string().nullable(),
  Address_Line_2: z.string().nullable(),
  Pastor_Name: z.string().nullable(),
  Mass_Schedule: z.array(MassScheduleEntrySchema),
});
export type OrganizationDetail = z.infer<typeof OrganizationDetailSchema>;
