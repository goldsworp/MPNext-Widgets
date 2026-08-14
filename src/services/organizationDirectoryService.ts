import { MPHelper } from "@/lib/providers/ministry-platform";
import { DomainTimezoneService } from "@/services/domainTimezoneService";
import type { OrganizationSummary, OrganizationDetail, MassScheduleEntry } from "@mpnext/types";

// ── MP Record Types ──

interface OrganizationRow {
  Congregation_ID: number;
  Name: string;
  Description: string | null;
  Location_Category_ID: number | null;
  Location_Category: string | null;
  Location_Group_ID: number | null;
  Location_Group: string | null;
  Phone: string | null;
  City: string | null;
  State: string | null;
  Postal_Code: string | null;
  Latitude: string | null;
  Longitude: string | null;
  Giving_URL: string | null;
}

interface OrganizationDetailRow extends OrganizationRow {
  Address_Line_1: string | null;
  Address_Line_2: string | null;
  Pastor_Name: string | null;
}

interface MassEventRow {
  Event_Start_Date: string;
  Event_Title: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Same shared-select-column set used by both the list and detail queries —
// kept in one place so the two stay in sync.
const ORGANIZATION_SELECT = [
  "Congregations.Congregation_ID",
  "Congregations.Congregation_Name AS Name",
  "Congregations.Description",
  "Location_ID_TABLE.Location_Category_ID",
  "Location_ID_TABLE_Location_Category_ID_TABLE.Location_Category",
  "Location_ID_TABLE.Location_Group_ID",
  "Location_ID_TABLE_Location_Group_ID_TABLE.Location_Group",
  "Location_ID_TABLE.Phone",
  "Location_ID_TABLE_Address_ID_TABLE.City",
  "Location_ID_TABLE_Address_ID_TABLE.[State/Region] AS State",
  "Location_ID_TABLE_Address_ID_TABLE.Postal_Code",
  "Location_ID_TABLE_Address_ID_TABLE.Latitude",
  "Location_ID_TABLE_Address_ID_TABLE.Longitude",
  "Congregations.Giving_URL",
];

// Orgs are hidden if not marked for the public website, or if past their end
// date, or still in a "coming soon" state — the classic widget's stored
// procedure applied these unconditionally, so there's no corresponding
// widget attribute to turn them off.
const VISIBILITY_FILTER =
  "Congregations.Available_Online = 1 " +
  "AND (Congregations.End_Date IS NULL OR Congregations.End_Date > GETDATE()) " +
  "AND Congregations.Coming_Soon = 0";

function toNumberOrNull(value: string | null): number | null {
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapOrganizationRow(row: OrganizationRow, logoUrl: string | null): OrganizationSummary {
  return {
    Congregation_ID: row.Congregation_ID,
    Name: row.Name,
    Description: row.Description,
    Location_Category_ID: row.Location_Category_ID,
    Location_Category: row.Location_Category,
    Location_Group_ID: row.Location_Group_ID,
    Location_Group: row.Location_Group,
    City: row.City,
    State: row.State,
    Postal_Code: row.Postal_Code,
    Phone: row.Phone,
    Latitude: toNumberOrNull(row.Latitude),
    Longitude: toNumberOrNull(row.Longitude),
    Logo_URL: logoUrl,
    Giving_URL: row.Giving_URL,
  };
}

export class OrganizationDirectoryService {
  private static instance: OrganizationDirectoryService;
  private mp: MPHelper | null = null;
  private apiBaseUrl = "";

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<OrganizationDirectoryService> {
    if (!OrganizationDirectoryService.instance) {
      OrganizationDirectoryService.instance = new OrganizationDirectoryService();
      await OrganizationDirectoryService.instance.initialize();
    }
    return OrganizationDirectoryService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
    this.apiBaseUrl = (process.env.MINISTRY_PLATFORM_BASE_URL || "").replace(/\/$/, "");
  }

  /**
   * Public directory of organizations (parishes, schools, cemeteries,
   * hospitals, offices, etc.) — native REST-query translation of the classic
   * widget's dbo.api_custom_OrganizationFinder stored procedure.
   *
   * Logos are resolved via MP's native record-attachment mechanism
   * (`getFilesByRecord` on the Congregations table), not the classic widget's
   * separate `api_custom_OrganizationFinder_Logos` helper view — that view
   * only exists on tenants that ran the classic widget's logo deploy script,
   * and this REST translation shouldn't require it.
   *
   * All name search, alphabetical grouping, distance sort/filter, and
   * pagination happens client-side in the widget — this returns every
   * organization matching the (optional) category/group/cluster filters.
   */
  public async getOrganizations(params: {
    locationCategoryIds?: number[];
    congregationIds?: number[];
  }): Promise<OrganizationSummary[]> {
    const { locationCategoryIds, congregationIds } = params;

    let filter = VISIBILITY_FILTER;
    if (locationCategoryIds && locationCategoryIds.length > 0) {
      filter += ` AND Location_ID_TABLE.Location_Category_ID IN (${locationCategoryIds.join(",")})`;
    }
    if (congregationIds && congregationIds.length > 0) {
      filter += ` AND Congregations.Congregation_ID IN (${congregationIds.join(",")})`;
    }

    const rows = await this.mp!.getTableRecords<OrganizationRow>({
      table: "Congregations",
      select: ORGANIZATION_SELECT.join(", "),
      filter,
      orderBy: "Congregations.Congregation_Name",
    });

    if (rows.length === 0) return [];

    const logoByCongregationId = await this.resolveLogos(rows.map((r) => r.Congregation_ID));
    return rows.map((row) => mapOrganizationRow(row, logoByCongregationId.get(row.Congregation_ID) ?? null));
  }

  /**
   * A single organization's detail page — native REST-query translation of
   * the classic widget's dbo.api_custom_OrganizationDetail stored procedure.
   *
   * @param massEventTypeId - The Event_Type_ID that identifies a "Mass" event
   *   on this MP tenant, used to build the weekly Mass schedule section.
   *   Unlike Mass Intention Calendar / Perpetual Adoration, this is OPTIONAL:
   *   most organizations in the directory (schools, cemeteries, offices)
   *   aren't parishes and have no Mass schedule at all, so omitting it is a
   *   safe default — the section just renders empty, matching the classic
   *   widget's own graceful "no Mass events keeps the section and says none
   *   are published" behavior.
   */
  public async getOrganizationDetail(
    congregationId: number,
    massEventTypeId?: number
  ): Promise<OrganizationDetail> {
    const rows = await this.mp!.getTableRecords<OrganizationDetailRow>({
      table: "Congregations",
      select: [
        ...ORGANIZATION_SELECT,
        "Location_ID_TABLE_Address_ID_TABLE.Address_Line_1",
        "Location_ID_TABLE_Address_ID_TABLE.Address_Line_2",
        "Pastor_TABLE_Contact_ID_TABLE.Display_Name AS Pastor_Name",
      ].join(", "),
      filter: `${VISIBILITY_FILTER} AND Congregations.Congregation_ID = ${congregationId}`,
      top: 1,
    });

    if (rows.length === 0) {
      throw new Error("Organization not found");
    }

    const row = rows[0];
    const [logoByCongregationId, massSchedule] = await Promise.all([
      this.resolveLogos([row.Congregation_ID]),
      massEventTypeId ? this.getWeeklyMassSchedule(congregationId, massEventTypeId) : Promise.resolve([]),
    ]);

    return {
      ...mapOrganizationRow(row, logoByCongregationId.get(row.Congregation_ID) ?? null),
      Address_Line_1: row.Address_Line_1,
      Address_Line_2: row.Address_Line_2,
      Pastor_Name: row.Pastor_Name,
      Mass_Schedule: massSchedule,
    };
  }

  /**
   * Derives a display-friendly weekly Mass schedule (e.g. "Sunday 9:00 AM")
   * from the next 14 days of actual scheduled Mass events, deduped to
   * distinct day-of-week + time combinations. There's no separate
   * "recurring schedule" record in MP to read this from directly — Events
   * are individual dated instances — so a two-week window is used to
   * reliably capture every day of the week at least once even around
   * holidays/skipped instances.
   */
  private async getWeeklyMassSchedule(congregationId: number, massEventTypeId: number): Promise<MassScheduleEntry[]> {
    const tz = DomainTimezoneService.getInstance();
    const nowMpString = await tz.toMpSqlDatetime(new Date());
    const twoWeeksOutMpString = await tz.toMpSqlDatetime(
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    );

    const rows = await this.mp!.getTableRecords<MassEventRow>({
      table: "Events",
      select: "Event_Start_Date, Event_Title",
      filter:
        `Congregation_ID = ${congregationId} ` +
        `AND Event_Type_ID = ${massEventTypeId} ` +
        `AND Cancelled = 0 ` +
        `AND ISNULL(_Approved, 0) = 1 ` +
        `AND Event_Start_Date >= '${nowMpString}' ` +
        `AND Event_Start_Date < '${twoWeeksOutMpString}'`,
      orderBy: "Event_Start_Date",
      top: 200,
    });

    // Event_Start_Date is already an MP-domain wall-clock string (no "Z"/
    // offset) — parse its components directly rather than routing through
    // Date/timezone conversion, since no conversion is needed to display a
    // value that's already in the domain's local time.
    const seen = new Map<string, MassScheduleEntry & { minuteOfDay: number }>();
    for (const row of rows) {
      const match = row.Event_Start_Date.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (!match) continue;
      const [, y, mo, d, h, mi] = match;
      const dayOfWeek = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
      const hour24 = Number(h);
      const minute = Number(mi);
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      const timeLabel = `${hour12}:${String(minute).padStart(2, "0")} ${hour24 < 12 ? "AM" : "PM"}`;
      const key = `${dayOfWeek}-${timeLabel}`;
      if (!seen.has(key)) {
        seen.set(key, {
          Day_Of_Week: DAY_NAMES[dayOfWeek],
          Day_Of_Week_Number: dayOfWeek,
          Time_Label: timeLabel,
          Event_Title: row.Event_Title,
          minuteOfDay: hour24 * 60 + minute,
        });
      }
    }

    // Sort Saturday-first (typical parish bulletin convention: Saturday
    // vigil, then Sunday, then the weekdays) rather than JS's native
    // Sunday=0 ordering. Day_Of_Week_Number itself stays plain JS
    // convention (Sunday=0..Saturday=6) since that's the more broadly
    // useful value for any other consumer of this field.
    const sortKey = (n: number) => (n + 1) % 7;
    return [...seen.values()]
      .sort((a, b) => sortKey(a.Day_Of_Week_Number) - sortKey(b.Day_Of_Week_Number) || a.minuteOfDay - b.minuteOfDay)
      .map(({ minuteOfDay: _minuteOfDay, ...entry }) => entry);
  }

  private async resolveLogos(congregationIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (congregationIds.length === 0) return map;

    const batchSize = 20;
    for (let i = 0; i < congregationIds.length; i += batchSize) {
      const batch = congregationIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (congregationId) => {
          const files = await this.mp!.getFilesByRecord({
            table: "Congregations",
            recordId: congregationId,
            defaultOnly: true,
          });
          if (files.length > 0 && files[0].IsImage) {
            return { congregationId, url: `${this.apiBaseUrl}/files/${files[0].UniqueFileId}` };
          }
          return null;
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          map.set(result.value.congregationId, result.value.url);
        }
      }
    }
    return map;
  }
}
