import { MPHelper } from "@/lib/providers/ministry-platform";
import { DomainTimezoneService } from "@/services/domainTimezoneService";
import type { AdorationSlot, PerpetualAdorationRegisterResponse } from "@mpnext/types";

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

interface ParticipantRecord {
  Event_ID: number;
  Event_Participant_ID: number;
  Display_Name: string;
}

interface DpUserRecord {
  Contact_ID: number;
}

interface ContactRecord {
  Participant_Record: number | null;
}

// Statuses that count as "slot reserved": 2 = Registered, 3 = Attended,
// 4 = Confirmed (excludes 1 Interested, 5 Cancelled, 20 Abandoned, 21
// Awaiting Payment). Matches massIntentionCalendarService.ts.
const RESERVED_STATUS_IDS = [2, 3, 4];
const REGISTERED_STATUS_ID = 2;
const ADORATION_EVENT_TYPE_ID = 14;

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

export class PerpetualAdorationService {
  private static instance: PerpetualAdorationService;
  private mp: MPHelper | null = null;

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<PerpetualAdorationService> {
    if (!PerpetualAdorationService.instance) {
      PerpetualAdorationService.instance = new PerpetualAdorationService();
      await PerpetualAdorationService.instance.initialize();
    }
    return PerpetualAdorationService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
  }

  /**
   * Perpetual Adoration slots (Event_Type_ID 14) in a date range, with a
   * registrant count and the first committed adorer's name per slot. Native
   * REST-query translation of the classic widget's
   * dbo.api_custom_PerpetualAdorationCalendar_JSON stored procedure.
   *
   * Deliberately does NOT filter on _Web_Approved / Visibility_Level_ID —
   * adoration slots are high-volume and kept off the public events calendar
   * on purpose, matching the source procedure's own comment.
   */
  public async getSlots(params: {
    startDate: string;
    endDate: string;
    congregationIds?: number[];
  }): Promise<AdorationSlot[]> {
    const { startDate, endDate, congregationIds } = params;

    const tz = DomainTimezoneService.getInstance();
    const mpStartDate = await tz.toMpSqlDatetime(startDate);
    const mpEndDate = await tz.toMpSqlDatetime(endDate);

    let filter =
      `Events.Event_Type_ID = ${ADORATION_EVENT_TYPE_ID} ` +
      `AND Events.Cancelled = 0 ` +
      `AND ISNULL(Events._Approved, 0) = 1 ` +
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
    const participantBatches = await Promise.all(
      chunk(eventIds, ID_BATCH_SIZE).map((batch) =>
        this.mp!.getTableRecords<ParticipantRecord>({
          table: "Event_Participants",
          select: "Event_ID, Event_Participant_ID, Participant_ID_TABLE_Contact_ID_TABLE.Display_Name",
          filter: `Event_ID IN (${batch.join(",")}) AND Participation_Status_ID IN (${RESERVED_STATUS_IDS.join(",")})`,
          orderBy: "Event_ID, Event_Participant_ID",
        })
      )
    );

    // Group by Event_ID; since each batch is already ordered by
    // Event_Participant_ID, the first row per group is the earliest sign-up
    // ("first" adorer), matching the source procedure's ORDER BY.
    const participantsByEventId = new Map<number, ParticipantRecord[]>();
    for (const row of participantBatches.flat()) {
      const list = participantsByEventId.get(row.Event_ID);
      if (list) list.push(row);
      else participantsByEventId.set(row.Event_ID, [row]);
    }

    return eventRows.map((e) => {
      const participants = participantsByEventId.get(e.Event_ID) ?? [];
      const registrantCount = participants.length;
      return {
        Event_ID: e.Event_ID,
        Event_Title: e.Event_Title,
        Event_Start_Date: e.Event_Start_Date,
        Event_End_Date: e.Event_End_Date,
        Congregation_ID: e.Congregation_ID,
        Congregation_Name: e.Congregation_Name,
        Registration_Active: e.Registration_Active,
        Registrant_Count: registrantCount,
        Slot_Status: registrantCount > 0 ? "Adorer Committed" : "Needs Adorer",
        First_Participant: participants[0]?.Display_Name ?? null,
      };
    });
  }

  /**
   * Registers the signed-in user as the adorer for each eligible selected
   * slot. Native REST-query translation of the classic widget's
   * dbo.api_custom_PerpetualAdorationRegister_JSON stored procedure.
   *
   * "Eligible" mirrors the source procedure: a real, non-cancelled
   * Perpetual Adoration event in the future, that this user does not
   * already hold, and that no one else has already claimed. Unlike the
   * original single atomic INSERT...SELECT, this REST-API translation
   * checks eligibility with separate reads before creating records, which
   * widens (but does not introduce) the race window for the "one adorer
   * per slot" rule — an inherent tradeoff of the REST-API approach.
   */
  public async registerSlots(params: {
    userGuid: string;
    eventIds: number[];
  }): Promise<PerpetualAdorationRegisterResponse> {
    const { userGuid, eventIds } = params;
    const requestedCount = eventIds.length;

    if (requestedCount === 0) {
      return { result: "error", message: "No slots were selected.", requestedCount: 0, registeredCount: 0, registeredEventIds: [] };
    }

    // ── 1. Resolve the signed-in user's Participant record ──
    const users = await this.mp!.getTableRecords<DpUserRecord>({
      table: "dp_Users",
      select: "Contact_ID",
      filter: `User_GUID = '${userGuid}'`,
      top: 1,
    });
    const contactId = users[0]?.Contact_ID;

    let participantId: number | undefined;
    if (contactId) {
      const contacts = await this.mp!.getTableRecords<ContactRecord>({
        table: "Contacts",
        select: "Participant_Record",
        filter: `Contact_ID = ${contactId}`,
        top: 1,
      });
      participantId = contacts[0]?.Participant_Record ?? undefined;

      if (!participantId) {
        const participants = await this.mp!.getTableRecords<{ Participant_ID: number }>({
          table: "Participants",
          select: "Participant_ID",
          filter: `Contact_ID = ${contactId}`,
          top: 1,
        });
        participantId = participants[0]?.Participant_ID;
      }
    }

    if (!participantId) {
      return {
        result: "error",
        message: "Could not identify the signed-in participant. Please sign in and try again.",
        requestedCount,
        registeredCount: 0,
        registeredEventIds: [],
      };
    }

    // ── 2. Determine which requested events are real, open, future slots ──
    const tz = DomainTimezoneService.getInstance();
    const nowMpString = await tz.toMpSqlDatetime(new Date());

    const eventRows = await this.mp!.getTableRecords<{ Event_ID: number }>({
      table: "Events",
      select: "Event_ID",
      filter:
        `Event_ID IN (${eventIds.join(",")}) ` +
        `AND Event_Type_ID = ${ADORATION_EVENT_TYPE_ID} ` +
        `AND Cancelled = 0 ` +
        `AND Event_Start_Date >= '${nowMpString}'`,
    });
    const realEventIds = new Set(eventRows.map((e) => e.Event_ID));

    // ── 3. Exclude slots already claimed by anyone, or already held by this user ──
    const existingParticipants = await this.mp!.getTableRecords<{ Event_ID: number; Participant_ID: number }>({
      table: "Event_Participants",
      select: "Event_ID, Participant_ID",
      filter: `Event_ID IN (${eventIds.join(",")}) AND Participation_Status_ID IN (${RESERVED_STATUS_IDS.join(",")})`,
    });
    const claimedEventIds = new Set(existingParticipants.map((p) => p.Event_ID));
    const alreadyHeldByUserEventIds = new Set(
      existingParticipants.filter((p) => p.Participant_ID === participantId).map((p) => p.Event_ID)
    );

    const eligibleEventIds = eventIds.filter(
      (id) => realEventIds.has(id) && !claimedEventIds.has(id) && !alreadyHeldByUserEventIds.has(id)
    );

    if (eligibleEventIds.length === 0) {
      return { result: "ok", participantId, requestedCount, registeredCount: 0, registeredEventIds: [] };
    }

    // ── 4. Create the Event Participant records ──
    await this.mp!.createTableRecords("Event_Participants", eligibleEventIds.map((eventId) => ({
      Event_ID: eventId,
      Participant_ID: participantId,
      Participation_Status_ID: REGISTERED_STATUS_ID,
      Registrant_Message_Sent: false,
      Attendee_Message_Sent: false,
      Attending_Online: false,
    })));

    return {
      result: "ok",
      participantId,
      requestedCount,
      registeredCount: eligibleEventIds.length,
      registeredEventIds: eligibleEventIds,
    };
  }
}
