import { MPHelper } from "@/lib/providers/ministry-platform";
import { DomainTimezoneService } from "@/services/domainTimezoneService";
import type { FaithFormationPerson, FaithFormationLeader, FaithFormationMeeting } from "@mpnext/types";

// ── MP Record Types ──

interface DpUserRecord {
  Contact_ID: number;
}

interface ContactRecord {
  Household_ID: number | null;
}

interface PersonRecord {
  Contact_ID: number;
  Display_Name: string;
}

interface GroupParticipantRecord {
  Group_Participant_ID: number;
  Group_ID: number;
  Group_Name: string;
  Start_Date: string;
  End_Date: string | null;
  Contact_ID: number;
}

interface LeaderRecord {
  Group_ID: number;
  Start_Date: string;
  End_Date: string | null;
  Contact_ID: number;
  Display_Name: string;
  Last_Name: string;
  First_Name: string;
  Role_Title: string;
  Show_Phone: boolean;
  Show_Email: boolean;
  Mobile_Phone: string | null;
  Email_Address: string | null;
}

interface EventLinkRecord {
  Group_ID: number;
  Event_ID: number;
}

interface EventRecord {
  Event_ID: number;
  Event_Title: string;
  Event_Start_Date: string;
  Event_End_Date: string;
}

interface AttendanceRecord {
  Event_ID: number;
  Participation_Status_ID: number;
  Contact_ID: number;
}

// "Registered" / "Attended" / "Confirmed" — the only statuses this widget
// treats as a real meeting record. See Participation_Statuses.
const REGISTERED_STATUS_ID = 2;
const ATTENDED_STATUS_IDS = [3, 4];
const RELEVANT_STATUS_IDS = [REGISTERED_STATUS_ID, ...ATTENDED_STATUS_IDS];

const DECEASED_STATUS_ID = 3;
const LEADER_ROLE_TYPE_ID = 1;
const NO_END_DATE = "9999-12-31";

function dateOnly(mpDatetime: string): string {
  return mpDatetime.slice(0, 10);
}

/** Wall-clock string comparison — safe because MP's zero-padded datetime strings sort lexicographically. */
function normalizeForCompare(mpDatetime: string): string {
  return mpDatetime.replace("T", " ");
}

// A large IN (...) list can push the request URL past the server's length
// limit (a plain IIS 404, not an MP error) — batch large ID lists instead.
const ID_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export class FaithFormationService {
  private static instance: FaithFormationService;
  private mp: MPHelper | null = null;
  private apiBaseUrl = "";

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<FaithFormationService> {
    if (!FaithFormationService.instance) {
      FaithFormationService.instance = new FaithFormationService();
      await FaithFormationService.instance.initialize();
    }
    return FaithFormationService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
    this.apiBaseUrl = (process.env.MINISTRY_PLATFORM_BASE_URL || "").replace(/\/$/, "");
  }

  /**
   * Household members enrolled in Faith Formation (or any Ministry) groups,
   * with their current/past group details, leaders, and meeting history.
   * Native REST-query translation of the classic widget's
   * dbo.api_custom_FaithFormationFamily_JSON stored procedure.
   */
  public async getFamilyFaithFormation(params: {
    userGuid: string;
    ministryId: number;
    showLeaderEmail: boolean;
    showLeaderMobilePhone: boolean;
  }): Promise<FaithFormationPerson[]> {
    const { userGuid, ministryId, showLeaderEmail, showLeaderMobilePhone } = params;

    // ── Resolve the signed-in Contact and Household ──
    const users = await this.mp!.getTableRecords<DpUserRecord>({
      table: "dp_Users",
      select: "Contact_ID",
      filter: `User_GUID = '${userGuid}'`,
      top: 1,
    });
    const contactId = users[0]?.Contact_ID;
    if (!contactId) return [];

    const contacts = await this.mp!.getTableRecords<ContactRecord>({
      table: "Contacts",
      select: "Household_ID",
      filter: `Contact_ID = ${contactId}`,
      top: 1,
    });
    const householdId = contacts[0]?.Household_ID;
    if (!householdId) return [];

    // ── #People — household members enrolled in a group under this Ministry ──
    const peopleRows = await this.mp!.getTableRecords<PersonRecord>({
      table: "Group_Participants",
      select:
        "Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID, Participant_ID_TABLE_Contact_ID_TABLE.Display_Name",
      filter:
        `Participant_ID_TABLE_Contact_ID_TABLE.Household_ID = ${householdId} ` +
        `AND Participant_ID_TABLE_Contact_ID_TABLE.Contact_Status_ID <> ${DECEASED_STATUS_ID} ` +
        `AND Group_ID_TABLE.Ministry_ID = ${ministryId}`,
      distinct: true,
    });

    if (peopleRows.length === 0) return [];

    const peopleContactIds = [...new Set(peopleRows.map((r) => r.Contact_ID))];
    const displayNameByContactId = new Map(peopleRows.map((r) => [r.Contact_ID, r.Display_Name]));

    // ── #GP — every Faith Formation Group Participant record for those people ──
    const gpRows = await this.mp!.getTableRecords<GroupParticipantRecord>({
      table: "Group_Participants",
      select: [
        "Group_Participants.Group_Participant_ID",
        "Group_Participants.Group_ID",
        "Group_ID_TABLE.Group_Name AS Group_Name",
        "Group_Participants.Start_Date",
        "Group_Participants.End_Date",
        "Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID",
      ].join(", "),
      filter:
        `Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID IN (${peopleContactIds.join(",")}) ` +
        `AND Group_ID_TABLE.Ministry_ID = ${ministryId}`,
    });

    if (gpRows.length === 0) return [];

    const groupIds = [...new Set(gpRows.map((r) => r.Group_ID))];

    // ── #Leaders — Leader-typed Group Participants for every group above ──
    const leaderRows = await this.mp!.getTableRecords<LeaderRecord>({
      table: "Group_Participants",
      select: [
        "Group_Participants.Group_ID",
        "Group_Participants.Start_Date",
        "Group_Participants.End_Date",
        "Group_Participants.Show_Phone",
        "Group_Participants.Show_Email",
        "Group_Role_ID_TABLE.Role_Title",
        "Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID",
        "Participant_ID_TABLE_Contact_ID_TABLE.Display_Name",
        "Participant_ID_TABLE_Contact_ID_TABLE.Last_Name",
        "Participant_ID_TABLE_Contact_ID_TABLE.First_Name",
        "Participant_ID_TABLE_Contact_ID_TABLE.Mobile_Phone",
        "Participant_ID_TABLE_Contact_ID_TABLE.Email_Address",
      ].join(", "),
      filter:
        `Group_Participants.Group_ID IN (${groupIds.join(",")}) ` +
        `AND Group_Role_ID_TABLE.Group_Role_Type_ID = ${LEADER_ROLE_TYPE_ID}`,
      orderBy: "Participant_ID_TABLE_Contact_ID_TABLE.Last_Name, Participant_ID_TABLE_Contact_ID_TABLE.First_Name",
    });

    // ── Photos — DEFAULT-flagged file per contact (household members + leaders) ──
    const leaderContactIds = leaderRows.map((l) => l.Contact_ID);
    const allContactIds = [...new Set([...peopleContactIds, ...leaderContactIds])];
    const photoUrlByContactId = await this.resolvePhotos(allContactIds);

    // ── #GroupEvents — events linked to each group via Event_Groups or Event_Rooms.
    // Different MP setups link events to groups through one, the other, or both —
    // fetched independently so one source being unavailable (e.g. the API client's
    // security role lacking read access to it) doesn't break the other.
    const [eventGroupResult, eventRoomResult] = await Promise.allSettled([
      this.mp!.getTableRecords<EventLinkRecord>({
        table: "Event_Groups",
        select: "Group_ID, Event_ID",
        filter: `Group_ID IN (${groupIds.join(",")})`,
      }),
      this.mp!.getTableRecords<EventLinkRecord>({
        table: "Event_Rooms",
        select: "Group_ID, Event_ID",
        filter: `Group_ID IN (${groupIds.join(",")})`,
      }),
    ]);
    if (eventGroupResult.status === "rejected") {
      console.warn("FaithFormationService: Event_Groups query failed, continuing with Event_Rooms only:", eventGroupResult.reason);
    }
    if (eventRoomResult.status === "rejected") {
      console.warn("FaithFormationService: Event_Rooms query failed, continuing with Event_Groups only:", eventRoomResult.reason);
    }
    const eventGroupRows = eventGroupResult.status === "fulfilled" ? eventGroupResult.value : [];
    const eventRoomRows = eventRoomResult.status === "fulfilled" ? eventRoomResult.value : [];

    const eventIdsByGroupId = new Map<number, Set<number>>();
    for (const link of [...eventGroupRows, ...eventRoomRows]) {
      const set = eventIdsByGroupId.get(link.Group_ID) ?? new Set<number>();
      set.add(link.Event_ID);
      eventIdsByGroupId.set(link.Group_ID, set);
    }
    const allEventIds = [...new Set([...eventGroupRows, ...eventRoomRows].map((r) => r.Event_ID))];

    // ── Event details + this person's own attendance for each related event ──
    let eventById = new Map<number, EventRecord>();
    let attendanceByContactAndEvent = new Map<string, number>();

    if (allEventIds.length > 0) {
      const eventBatches = await Promise.all(
        chunk(allEventIds, ID_BATCH_SIZE).map((batch) =>
          this.mp!.getTableRecords<EventRecord>({
            table: "Events",
            select: "Event_ID, Event_Title, Event_Start_Date, Event_End_Date",
            filter: `Event_ID IN (${batch.join(",")}) AND Cancelled = 0`,
          })
        )
      );
      eventById = new Map(eventBatches.flat().map((e) => [e.Event_ID, e]));

      const attendanceBatches = await Promise.all(
        chunk(allEventIds, ID_BATCH_SIZE).map((batch) =>
          this.mp!.getTableRecords<AttendanceRecord>({
            table: "Event_Participants",
            select: [
              "Event_Participants.Event_ID",
              "Event_Participants.Participation_Status_ID",
              "Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID",
            ].join(", "),
            filter:
              `Event_Participants.Event_ID IN (${batch.join(",")}) ` +
              `AND Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID IN (${peopleContactIds.join(",")}) ` +
              `AND Event_Participants.Participation_Status_ID IN (${RELEVANT_STATUS_IDS.join(",")})`,
          })
        )
      );
      attendanceByContactAndEvent = new Map(
        attendanceBatches.flat().map((a) => [`${a.Contact_ID}:${a.Event_ID}`, a.Participation_Status_ID])
      );
    }

    // ── Classify each Group Participant record as Current / Past / Other ──
    const domainTz = await DomainTimezoneService.getInstance().getMpTimezone();
    const nowMpString = normalizeForCompare(
      await DomainTimezoneService.getInstance().toMpSqlDatetime(new Date())
    );
    void domainTz; // resolved for parity with other services; comparisons use the MP-TZ wall-clock string
    const todayStr = dateOnly(nowMpString);

    type GroupStatus = "Current" | "Past" | "Other";
    const statusOf = (gp: GroupParticipantRecord): GroupStatus => {
      const endStr = gp.End_Date ? dateOnly(gp.End_Date) : NO_END_DATE;
      if (todayStr >= dateOnly(gp.Start_Date) && todayStr <= endStr) return "Current";
      if (gp.End_Date && todayStr > endStr) return "Past";
      return "Other";
    };

    // ── Build meetings for one Group Participant record ──
    const buildMeetings = (gp: GroupParticipantRecord): FaithFormationMeeting[] => {
      const eventIds = eventIdsByGroupId.get(gp.Group_ID);
      if (!eventIds) return [];
      const windowStart = dateOnly(gp.Start_Date);
      const windowEnd = gp.End_Date ? dateOnly(gp.End_Date) : NO_END_DATE;

      const meetings: FaithFormationMeeting[] = [];
      for (const eventId of eventIds) {
        const event = eventById.get(eventId);
        if (!event) continue;
        if (dateOnly(event.Event_Start_Date) < windowStart || dateOnly(event.Event_Start_Date) > windowEnd) {
          continue;
        }
        const statusId = attendanceByContactAndEvent.get(`${gp.Contact_ID}:${eventId}`);
        if (statusId === undefined) continue;
        meetings.push({
          Event_ID: event.Event_ID,
          Event_Title: event.Event_Title,
          Event_Start_Date: event.Event_Start_Date,
          Event_End_Date: event.Event_End_Date,
          Participation_Status_ID: statusId,
          Is_Present: ATTENDED_STATUS_IDS.includes(statusId),
        });
      }
      return meetings;
    };

    // ── Leaders active during a Group Participant record's own enrollment window ──
    const leadersFor = (gp: GroupParticipantRecord): FaithFormationLeader[] => {
      const windowStart = dateOnly(gp.Start_Date);
      const windowEnd = gp.End_Date ? dateOnly(gp.End_Date) : NO_END_DATE;

      return leaderRows
        .filter((l) => {
          if (l.Group_ID !== gp.Group_ID) return false;
          const leaderStart = dateOnly(l.Start_Date);
          const leaderEnd = l.End_Date ? dateOnly(l.End_Date) : NO_END_DATE;
          return leaderStart <= windowEnd && leaderEnd >= windowStart;
        })
        .map((l) => ({
          Contact_ID: l.Contact_ID,
          Display_Name: l.Display_Name,
          Photo_URL: photoUrlByContactId.get(l.Contact_ID) ?? null,
          Role_Title: l.Role_Title,
          Mobile_Phone: showLeaderMobilePhone && l.Show_Phone ? l.Mobile_Phone : null,
          Email_Address: showLeaderEmail && l.Show_Email ? l.Email_Address : null,
        }));
    };

    // ── Assemble the per-person response ──
    const gpByContactId = new Map<number, GroupParticipantRecord[]>();
    for (const gp of gpRows) {
      const list = gpByContactId.get(gp.Contact_ID) ?? [];
      list.push(gp);
      gpByContactId.set(gp.Contact_ID, list);
    }

    const people: FaithFormationPerson[] = [];
    for (const personContactId of peopleContactIds) {
      const personGpRows = (gpByContactId.get(personContactId) ?? [])
        .slice()
        .sort((a, b) => b.Start_Date.localeCompare(a.Start_Date));

      const currentGroups = personGpRows
        .filter((gp) => statusOf(gp) === "Current")
        .map((gp) => {
          const allMeetings = buildMeetings(gp);
          return {
            Group_Participant_ID: gp.Group_Participant_ID,
            Group_ID: gp.Group_ID,
            Group_Name: gp.Group_Name,
            Participant_Start_Date: gp.Start_Date,
            Participant_End_Date: gp.End_Date,
            Leaders: leadersFor(gp),
            UpcomingMeetings: allMeetings
              .filter((m) => m.Participation_Status_ID === REGISTERED_STATUS_ID && normalizeForCompare(m.Event_Start_Date) >= nowMpString)
              .sort((a, b) => a.Event_Start_Date.localeCompare(b.Event_Start_Date)),
            PastMeetings: allMeetings
              .filter((m) => normalizeForCompare(m.Event_Start_Date) < nowMpString)
              .sort((a, b) => b.Event_Start_Date.localeCompare(a.Event_Start_Date)),
          };
        });

      const pastGroups = personGpRows
        .filter((gp) => statusOf(gp) === "Past")
        .map((gp) => {
          const meetings = buildMeetings(gp).sort((a, b) => b.Event_Start_Date.localeCompare(a.Event_Start_Date));
          return {
            Group_Participant_ID: gp.Group_Participant_ID,
            Group_ID: gp.Group_ID,
            Group_Name: gp.Group_Name,
            Participant_Start_Date: gp.Start_Date,
            Participant_End_Date: gp.End_Date,
            Total_Meetings: meetings.length,
            Attended_Meetings: meetings.filter((m) => m.Is_Present).length,
            Leaders: leadersFor(gp),
            Meetings: meetings,
          };
        });

      people.push({
        Contact_ID: personContactId,
        Display_Name: displayNameByContactId.get(personContactId) ?? "",
        Photo_URL: photoUrlByContactId.get(personContactId) ?? null,
        CurrentGroups: currentGroups,
        PastGroups: pastGroups,
      });
    }

    people.sort((a, b) => a.Display_Name.localeCompare(b.Display_Name));
    return people;
  }

  private async resolvePhotos(contactIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (contactIds.length === 0) return map;

    const batchSize = 20;
    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (contactId) => {
          const files = await this.mp!.getFilesByRecord({
            table: "Contacts",
            recordId: contactId,
            defaultOnly: true,
          });
          if (files.length > 0 && files[0].IsImage) {
            return { contactId, url: `${this.apiBaseUrl}/files/${files[0].UniqueFileId}` };
          }
          return null;
        })
      );
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          map.set(result.value.contactId, result.value.url);
        }
      }
    }
    return map;
  }
}
