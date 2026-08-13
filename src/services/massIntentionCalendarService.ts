import { MPHelper } from "@/lib/providers/ministry-platform";
import { DomainTimezoneService } from "@/services/domainTimezoneService";
import type { MassEvent } from "@mpnext/types";

// ── MP Record Types ──

interface EventRecord {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Congregation_ID: number;
  Congregation_Name: string;
  Registration_Active: boolean;
}

interface RegistrantCountRecord {
  Event_ID: number;
  Registrant_Count: number;
}

// "Registered" / "Attended" / "Confirmed" — the only statuses that count as
// "an intention has been made" for this event. Matches Event_Participants.
const RELEVANT_STATUS_IDS = [2, 3, 4];
const MASS_EVENT_TYPE_ID = 13;

// A large IN (...) list can push the request URL past the server's length
// limit — batch large ID lists instead. See faithFormationService.ts.
const ID_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export class MassIntentionCalendarService {
  private static instance: MassIntentionCalendarService;
  private mp: MPHelper | null = null;

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<MassIntentionCalendarService> {
    if (!MassIntentionCalendarService.instance) {
      MassIntentionCalendarService.instance = new MassIntentionCalendarService();
      await MassIntentionCalendarService.instance.initialize();
    }
    return MassIntentionCalendarService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
  }

  /**
   * Mass events (Event_Type_ID 13) in a date range, with registrant counts
   * and availability status. Native REST-query translation of the classic
   * widget's dbo.api_custom_MassIntentionCalendar_JSON stored procedure.
   */
  public async getMassEvents(params: {
    startDate: string;
    endDate: string;
    congregationIds?: number[];
  }): Promise<MassEvent[]> {
    const { startDate, endDate, congregationIds } = params;

    // MP $filter literals are interpreted in the domain's wall-clock time zone.
    // Routing through DomainTimezoneService converts any incoming instant (Z or
    // offset-tagged, e.g. from FullCalendar's fetchInfo) to MP-TZ wall-clock so
    // the date-boundary query doesn't fail to parse or silently shift. See
    // fullCalendarService.ts's getEvents() for the same pattern.
    const tz = DomainTimezoneService.getInstance();
    const mpStartDate = await tz.toMpSqlDatetime(startDate);
    const mpEndDate = await tz.toMpSqlDatetime(endDate);

    let filter =
      `Events.Event_Type_ID = ${MASS_EVENT_TYPE_ID} ` +
      `AND Events.Cancelled = 0 ` +
      `AND ISNULL(Events._Approved, 0) = 1 ` +
      `AND ISNULL(Events._Web_Approved, 0) = 1 ` +
      `AND Events.Visibility_Level_ID = 4 ` +
      `AND Events.Event_Start_Date >= '${mpStartDate}' ` +
      `AND Events.Event_Start_Date < '${mpEndDate}'`;

    if (congregationIds && congregationIds.length > 0) {
      filter += ` AND Events.Congregation_ID IN (${congregationIds.join(",")})`;
    }

    const eventRows = await this.mp!.getTableRecords<EventRecord>({
      table: "Events",
      select: [
        "Events.Event_ID",
        "Events.Event_Title",
        "Events.Event_Start_Date",
        "Events.Event_End_Date",
        "Events.Congregation_ID",
        "Congregation_ID_TABLE.Congregation_Name",
        "Events.Registration_Active",
      ].join(", "),
      filter,
      orderBy: "Events.Event_Start_Date",
    });

    if (eventRows.length === 0) return [];

    const eventIds = eventRows.map((e) => e.Event_ID);
    const registrantCountBatches = await Promise.all(
      chunk(eventIds, ID_BATCH_SIZE).map((batch) =>
        this.mp!.getTableRecords<RegistrantCountRecord>({
          table: "Event_Participants",
          select: "Event_ID, COUNT(Event_Participant_ID) AS Registrant_Count",
          filter: `Event_ID IN (${batch.join(",")}) AND Participation_Status_ID IN (${RELEVANT_STATUS_IDS.join(",")})`,
          groupBy: "Event_ID",
        })
      )
    );
    const registrantCountByEventId = new Map(
      registrantCountBatches.flat().map((r) => [r.Event_ID, r.Registrant_Count])
    );

    // Domain-timezone-aware "now" so "Past" classification doesn't drift with
    // server/browser timezone (same approach as fullCalendarService.ts).
    const nowMpString = (await DomainTimezoneService.getInstance().toMpSqlDatetime(new Date())).replace(
      "T",
      " "
    );

    return eventRows.map((e) => {
      const registrantCount = registrantCountByEventId.get(e.Event_ID) ?? 0;
      const isPast = e.Event_Start_Date.replace("T", " ") < nowMpString;
      return {
        Event_ID: e.Event_ID,
        Event_Title: e.Event_Title,
        Event_Start_Date: e.Event_Start_Date,
        Event_End_Date: e.Event_End_Date,
        Congregation_ID: e.Congregation_ID,
        Congregation_Name: e.Congregation_Name,
        Registration_Active: e.Registration_Active,
        Registrant_Count: registrantCount,
        Intention_Status: isPast ? "Past" : registrantCount > 0 ? "Reserved" : "Available",
      };
    });
  }
}
