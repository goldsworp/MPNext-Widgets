import { MPHelper } from "@/lib/providers/ministry-platform";
import { DomainTimezoneService } from "@/services/domainTimezoneService";
import type {
  SpaceCongregation,
  SpaceBuilding,
  SpaceRoom,
  AvailabilityBlock,
  ReservationRequestResult,
} from "@mpnext/types";

// ── Pure date/time helpers ──
//
// Setup/cleanup buffers and MP's own busy-window overlap are deliberately
// computed as NAIVE wall-clock arithmetic, not real-elapsed-time arithmetic
// through DomainTimezoneService — "cleanup ends 15 minutes after the
// meeting's 5:00 PM wall-clock end" should always mean 5:15 PM on the
// clock, even on a DST-transition day, matching how a facility scheduler
// actually thinks about buffers. `Date.UTC(...)` is used here purely as a
// convenient calendar-math utility (exactly like
// organizationDirectoryService.ts's Mass Schedule day-of-week calculation)
// — it never represents a real UTC instant.

const MP_WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

export function parseMpWallClockToUtcMs(value: string): number | null {
  const match = value.match(MP_WALL_CLOCK_RE);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = "00"] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

export function utcMsToMpWallClockString(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * The effective busy window for a booking: the event's own start/end,
 * widened by setup time (before) and cleanup time (after). Returns null if
 * either wall-clock string can't be parsed.
 */
export function effectiveWindowMs(
  eventStartWallClock: string,
  eventEndWallClock: string,
  setupMinutes: number,
  cleanupMinutes: number
): { startMs: number; endMs: number } | null {
  const startMs = parseMpWallClockToUtcMs(eventStartWallClock);
  const endMs = parseMpWallClockToUtcMs(eventEndWallClock);
  if (startMs === null || endMs === null) return null;
  return {
    startMs: startMs - setupMinutes * 60_000,
    endMs: endMs + cleanupMinutes * 60_000,
  };
}

export function rangesOverlap(aStartMs: number, aEndMs: number, bStartMs: number, bEndMs: number): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

// Generous padding applied only to the MP query filter window, so a
// booking whose setup/cleanup buffer pushes its effective window just
// outside the literal Event_Start/End isn't missed by the query — the
// precise overlap check afterward uses the real effective window.
const QUERY_PADDING_MS = 6 * 60 * 60 * 1000;

// ── MP Record Types ──

interface EventRoomAvailabilityRow {
  Room_ID: number;
  Room_Name: string;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Minutes_for_Setup: number;
  Minutes_for_Cleanup: number;
}

const EVENT_ROOM_AVAILABILITY_SELECT = [
  "Event_Rooms.Room_ID",
  "Room_ID_TABLE.Room_Name",
  "Event_ID_TABLE.Event_Title",
  "Event_ID_TABLE.Event_Start_Date",
  "Event_ID_TABLE.Event_End_Date",
  "Event_ID_TABLE.Minutes_for_Setup",
  "Event_ID_TABLE.Minutes_for_Cleanup",
].join(", ");

export class SpaceAvailabilityService {
  private static instance: SpaceAvailabilityService;
  private mp: MPHelper | null = null;

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<SpaceAvailabilityService> {
    if (!SpaceAvailabilityService.instance) {
      SpaceAvailabilityService.instance = new SpaceAvailabilityService();
      await SpaceAvailabilityService.instance.initialize();
    }
    return SpaceAvailabilityService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
  }

  /** Congregations available for the widget to browse — always requires Available_Online, optionally narrowed to a configured set. */
  public async getCongregations(congregationIds?: number[]): Promise<SpaceCongregation[]> {
    let filter = "Congregations.Available_Online = 1";
    if (congregationIds && congregationIds.length > 0) {
      filter += ` AND Congregations.Congregation_ID IN (${congregationIds.join(",")})`;
    }

    return this.mp!.getTableRecords<SpaceCongregation>({
      table: "Congregations",
      select: "Congregations.Congregation_ID, Congregations.Congregation_Name",
      filter,
      orderBy: "Congregations.Congregation_Name",
    });
  }

  /**
   * Buildings under a congregation, reached via the Location chain
   * (Congregations don't reference Buildings directly). Returns an empty
   * list — rather than the requested congregation's data — if the caller
   * asks for a congregation outside the widget's configured set, so a
   * direct API call can't bypass the `congregation-ids` restriction.
   */
  public async getBuildings(congregationId: number, allowedCongregationIds?: number[]): Promise<SpaceBuilding[]> {
    if (allowedCongregationIds && allowedCongregationIds.length > 0 && !allowedCongregationIds.includes(congregationId)) {
      return [];
    }

    return this.mp!.getTableRecords<SpaceBuilding>({
      table: "Buildings",
      select: "Buildings.Building_ID, Buildings.Building_Name",
      filter: `Location_ID_TABLE.Congregation_ID = ${congregationId}`,
      orderBy: "Buildings.Building_Name",
    });
  }

  /**
   * The signed-in visitor's own contact info, for prefilling the
   * reservation-request form. Returns null for an anonymous visitor or if
   * the JWT's User_GUID doesn't resolve to a contact.
   */
  public async getCurrentContact(userGuid: string): Promise<{ name: string; email: string | null; phone: string | null } | null> {
    const users = await this.mp!.getTableRecords<{ Contact_ID: number }>({
      table: "dp_Users",
      select: "Contact_ID",
      filter: `User_GUID = '${userGuid}'`,
      top: 1,
    });
    const contactId = users[0]?.Contact_ID;
    if (!contactId) return null;

    const contacts = await this.mp!.getTableRecords<{ Display_Name: string; Email_Address: string | null; Mobile_Phone: string | null }>({
      table: "Contacts",
      select: "Display_Name, Email_Address, Mobile_Phone",
      filter: `Contact_ID = ${contactId}`,
      top: 1,
    });
    const contact = contacts[0];
    if (!contact) return null;

    return { name: contact.Display_Name, email: contact.Email_Address, phone: contact.Mobile_Phone };
  }

  /** Bookable rooms in a building. Client-side text filtering handles the search box — a building's own room list is small enough to fetch whole. */
  public async getRooms(buildingId: number): Promise<SpaceRoom[]> {
    return this.mp!.getTableRecords<SpaceRoom>({
      table: "Rooms",
      select: "Rooms.Room_ID, Rooms.Room_Name, Rooms.Room_Number, Rooms.Maximum_Capacity",
      filter: `Rooms.Building_ID = ${buildingId} AND Rooms.Bookable = 1`,
      orderBy: "Rooms.Room_Name",
    });
  }

  /**
   * Busy blocks for the given rooms across a date range, with setup/cleanup
   * already folded into each block's Start/End. `start`/`end` are ISO
   * instants from the widget's date-range picker; converted to the MP
   * domain's own wall-clock for the query filter (same pattern
   * perpetualAdorationService.getSlots uses), since Event_Start_Date is
   * stored as domain-local wall-clock, not UTC.
   */
  public async getAvailability(params: {
    roomIds: number[];
    start: string;
    end: string;
    showDetailedInfo: boolean;
  }): Promise<AvailabilityBlock[]> {
    const { roomIds, start, end, showDetailedInfo } = params;
    if (roomIds.length === 0) return [];

    const tz = DomainTimezoneService.getInstance();
    const mpStart = await tz.toMpSqlDatetime(start);
    const mpEnd = await tz.toMpSqlDatetime(end);
    const searchStartMs = parseMpWallClockToUtcMs(mpStart);
    const searchEndMs = parseMpWallClockToUtcMs(mpEnd);
    if (searchStartMs === null || searchEndMs === null) {
      throw new Error("Invalid start/end date range");
    }

    const paddedStart = utcMsToMpWallClockString(searchStartMs - QUERY_PADDING_MS);
    const paddedEnd = utcMsToMpWallClockString(searchEndMs + QUERY_PADDING_MS);

    const rows = await this.mp!.getTableRecords<EventRoomAvailabilityRow>({
      table: "Event_Rooms",
      select: EVENT_ROOM_AVAILABILITY_SELECT,
      filter:
        `Event_Rooms.Room_ID IN (${roomIds.join(",")}) ` +
        `AND Event_Rooms.Cancelled = 0 ` +
        `AND Event_ID_TABLE.Cancelled = 0 ` +
        `AND Event_ID_TABLE.Event_Start_Date < '${paddedEnd}' ` +
        `AND Event_ID_TABLE.Event_End_Date > '${paddedStart}'`,
      orderBy: "Event_ID_TABLE.Event_Start_Date",
      top: 1000,
    });

    const blocks: AvailabilityBlock[] = [];
    for (const row of rows) {
      const window = effectiveWindowMs(
        row.Event_Start_Date,
        row.Event_End_Date,
        row.Minutes_for_Setup,
        row.Minutes_for_Cleanup
      );
      if (!window) continue;
      if (!rangesOverlap(searchStartMs, searchEndMs, window.startMs, window.endMs)) continue;

      blocks.push({
        Room_ID: row.Room_ID,
        Room_Name: row.Room_Name,
        Start: utcMsToMpWallClockString(window.startMs),
        End: utcMsToMpWallClockString(window.endMs),
        Event_Title: showDetailedInfo ? row.Event_Title : null,
      });
    }

    return blocks;
  }

  /**
   * Creates a reservation request: resolves the requesting contact
   * (signed-in user, or the configured fallback), re-verifies the exact
   * requested block is still free, creates the Events + Event_Rooms
   * records, and emails the configured notification addresses. The
   * date/startTime/endTime form fields are treated as literal domain
   * wall-clock values (the room has one physical clock, regardless of the
   * visitor's own browser time zone) — no DomainTimezoneService conversion
   * needed for these, unlike the read-side search range above which comes
   * from a JS Date the visitor's browser produced.
   */
  public async createReservationRequest(params: {
    roomId: number;
    date: string;
    startTime: string;
    endTime: string;
    setupMinutes: number;
    cleanupMinutes: number;
    requestorName: string;
    requestorEmail: string;
    requestorPhone?: string;
    notes?: string;
    userGuid: string | null;
    defaultContactId: number | null;
    eventTypeId: number;
    programId: number;
    visibilityLevelId: number;
    notifyEmails: string[];
  }): Promise<ReservationRequestResult> {
    const startWallClock = `${params.date} ${params.startTime}:00`;
    const endWallClock = `${params.date} ${params.endTime}:00`;

    const requested = effectiveWindowMs(startWallClock, endWallClock, params.setupMinutes, params.cleanupMinutes);
    if (!requested || requested.startMs >= requested.endMs) {
      return { result: "error", message: "The requested date/time is invalid." };
    }

    // ── 1. Resolve the requesting contact ──
    let contactId: number | null = null;
    if (params.userGuid) {
      const users = await this.mp!.getTableRecords<{ Contact_ID: number }>({
        table: "dp_Users",
        select: "Contact_ID",
        filter: `User_GUID = '${params.userGuid}'`,
        top: 1,
      });
      contactId = users[0]?.Contact_ID ?? null;
    }
    if (!contactId) contactId = params.defaultContactId;
    if (!contactId) {
      return { result: "error", message: "Could not determine a contact for this reservation." };
    }

    // ── 2. Resolve the room's own congregation + name ──
    const rooms = await this.mp!.getTableRecords<{ Room_ID: number; Room_Name: string; Congregation_ID: number; Building_Name: string }>({
      table: "Rooms",
      select: "Rooms.Room_ID, Rooms.Room_Name, Building_ID_TABLE_Location_ID_TABLE.Congregation_ID, Building_ID_TABLE.Building_Name",
      filter: `Rooms.Room_ID = ${params.roomId}`,
      top: 1,
    });
    const room = rooms[0];
    if (!room) {
      return { result: "error", message: "Room not found." };
    }

    // ── 3. Re-check availability for the exact requested block server-side ──
    const paddedStart = utcMsToMpWallClockString(requested.startMs - QUERY_PADDING_MS);
    const paddedEnd = utcMsToMpWallClockString(requested.endMs + QUERY_PADDING_MS);
    const existingRows = await this.mp!.getTableRecords<EventRoomAvailabilityRow>({
      table: "Event_Rooms",
      select: EVENT_ROOM_AVAILABILITY_SELECT,
      filter:
        `Event_Rooms.Room_ID = ${params.roomId} ` +
        `AND Event_Rooms.Cancelled = 0 ` +
        `AND Event_ID_TABLE.Cancelled = 0 ` +
        `AND Event_ID_TABLE.Event_Start_Date < '${paddedEnd}' ` +
        `AND Event_ID_TABLE.Event_End_Date > '${paddedStart}'`,
    });

    const hasConflict = existingRows.some((row) => {
      const window = effectiveWindowMs(row.Event_Start_Date, row.Event_End_Date, row.Minutes_for_Setup, row.Minutes_for_Cleanup);
      return window !== null && rangesOverlap(requested.startMs, requested.endMs, window.startMs, window.endMs);
    });
    if (hasConflict) {
      return {
        result: "conflict",
        message: `Room ${room.Room_Name} not available at that time. Try another room, date, or time combination.`,
      };
    }

    // ── 4. Create the Event ──
    const contactLine = `${params.requestorName} (${params.requestorEmail}${params.requestorPhone ? ", " + params.requestorPhone : ""})`;
    const descriptionParts = [
      "Room reservation request submitted via the Space Availability widget.",
      `Requested by: ${contactLine}`,
    ];
    if (params.notes) descriptionParts.push(`Notes: ${params.notes}`);
    const description = descriptionParts.join("\n").slice(0, 2000);

    const createdEvents = await this.mp!.createTableRecords<Record<string, unknown>>("Events", [
      {
        Event_Title: `Room Request: ${room.Room_Name}`.slice(0, 75),
        Event_Type_ID: params.eventTypeId,
        Congregation_ID: room.Congregation_ID,
        Program_ID: params.programId,
        Primary_Contact: contactId,
        Minutes_for_Setup: params.setupMinutes,
        Event_Start_Date: startWallClock,
        Event_End_Date: endWallClock,
        Minutes_for_Cleanup: params.cleanupMinutes,
        Cancelled: false,
        Visibility_Level_ID: params.visibilityLevelId,
        Description: description,
      },
    ]);
    const eventId = createdEvents[0].Event_ID as number;

    // ── 5. Link the room ──
    const createdEventRooms = await this.mp!.createTableRecords<Record<string, unknown>>("Event_Rooms", [
      {
        Event_ID: eventId,
        Room_ID: params.roomId,
        Balance_Priority: 0,
        Closed: false,
        Auto_Close_At_Capacity: false,
        Cancelled: false,
      },
    ]);
    const eventRoomId = createdEventRooms[0].Event_Room_ID as number;

    // ── 6. Notify ──
    if (params.notifyEmails.length > 0) {
      const bodyLines = [
        "A new room reservation has been requested through the Space Availability Custom Widget.",
        "",
        `Congregation building: ${room.Building_Name}`,
        `Room: ${room.Room_Name}`,
        `Date: ${params.date}`,
        `Time: ${params.startTime} – ${params.endTime}`,
        `Setup: ${params.setupMinutes} minute(s) before / Cleanup: ${params.cleanupMinutes} minute(s) after`,
        "",
        `Requested by: ${params.requestorName}`,
        `Email: ${params.requestorEmail}`,
        params.requestorPhone ? `Phone: ${params.requestorPhone}` : null,
        params.notes ? `Notes: ${params.notes}` : null,
      ].filter((line): line is string => line !== null);

      await this.mp!.sendMessage({
        FromAddress: { DisplayName: params.requestorName, Address: params.requestorEmail },
        ToAddresses: params.notifyEmails.map((address) => ({ DisplayName: address, Address: address })),
        Subject: "Room Reservation Request — Space Availability Custom Widget",
        Body: bodyLines.join("\n"),
      });
    }

    return { result: "ok", eventId, eventRoomId };
  }
}
