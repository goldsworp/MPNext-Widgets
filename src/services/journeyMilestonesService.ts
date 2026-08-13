import { MPHelper } from "@/lib/providers/ministry-platform";
import type { JourneyMilestone, JourneyMilestoneFamilyMember } from "@mpnext/types";

// ── MP Record Types ──

interface MilestoneRecord {
  Milestone_ID: number;
  Milestone_Title: string;
  Icon: string | null;
  Sort_Order: number | null;
}

interface MilestoneFormRecord {
  Milestone_ID: number;
  Form_ID: number | null;
  Form_Title: string | null;
  Form_GUID: string | null;
  Event_ID: number | null;
  Event_Title: string | null;
}

interface ParticipantMilestoneRecord {
  Participant_Milestone_ID: number;
  Participant_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
}

interface DpUserRecord {
  Contact_ID: number;
}

interface ContactRecord {
  Participant_Record: number | null;
}

interface GroupRecord {
  Congregation_ID: number;
}

interface FamilyMemberRecord {
  Participant_ID: number;
  Contact_ID: number;
  Display_Name: string;
  Nickname: string | null;
  First_Name: string | null;
  Last_Name: string | null;
}

// Participation statuses treated as "completed" have no bearing here — a
// milestone is achieved purely by the presence of a Participant_Milestones
// row, matching the source procedure.

export class JourneyMilestonesService {
  private static instance: JourneyMilestonesService;
  private mp: MPHelper | null = null;

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<JourneyMilestonesService> {
    if (!JourneyMilestonesService.instance) {
      JourneyMilestonesService.instance = new JourneyMilestonesService();
      await JourneyMilestonesService.instance.initialize();
    }
    return JourneyMilestonesService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
  }

  /**
   * Every milestone in a Journey for the signed-in user, with completion
   * status/date and the parish's form or event link. Native REST-query
   * translation of dbo.api_custom_JourneyMilestonesIndividual_JSON.
   */
  public async getIndividualMilestones(params: {
    userGuid: string;
    journeyId: number;
    groupId?: number;
  }): Promise<JourneyMilestone[]> {
    const { userGuid, journeyId, groupId } = params;

    const participantId = await this.resolveParticipantId(userGuid);
    if (!participantId) return [];

    if (groupId) {
      const isCurrentMember = await this.isCurrentGroupMember(participantId, groupId);
      if (!isCurrentMember) return [];
    }

    const congregationId = groupId ? await this.resolveGroupCongregation(groupId) : null;
    const milestonesByParticipant = await this.buildMilestonesForParticipants([participantId], journeyId, congregationId);
    return milestonesByParticipant.get(participantId) ?? [];
  }

  /**
   * The signed-in user's own household members who are current participants
   * of a group, each with their milestones in a Journey. Native REST-query
   * translation of dbo.api_custom_JourneyMilestonesFamily_JSON.
   */
  public async getFamilyMilestones(params: {
    userGuid: string;
    journeyId: number;
    groupId: number;
  }): Promise<JourneyMilestoneFamilyMember[]> {
    const { userGuid, journeyId, groupId } = params;

    const householdId = await this.resolveHouseholdId(userGuid);
    if (!householdId) return [];

    const congregationId = await this.resolveGroupCongregation(groupId);

    const members = await this.mp!.getTableRecords<FamilyMemberRecord>({
      table: "Group_Participants",
      select: [
        "Participant_ID_TABLE_Contact_ID_TABLE.Contact_ID",
        "Group_Participants.Participant_ID",
        "Participant_ID_TABLE_Contact_ID_TABLE.Display_Name",
        "Participant_ID_TABLE_Contact_ID_TABLE.Nickname",
        "Participant_ID_TABLE_Contact_ID_TABLE.First_Name",
        "Participant_ID_TABLE_Contact_ID_TABLE.Last_Name",
      ].join(", "),
      filter:
        `Group_Participants.Group_ID = ${groupId} ` +
        `AND Participant_ID_TABLE_Contact_ID_TABLE.Household_ID = ${householdId} ` +
        `AND (Group_Participants.Start_Date IS NULL OR Group_Participants.Start_Date <= GETDATE()) ` +
        `AND (Group_Participants.End_Date IS NULL OR Group_Participants.End_Date > GETDATE()) ` +
        `AND (Participant_ID_TABLE_Contact_ID_TABLE.Contact_Status_ID IS NULL OR Participant_ID_TABLE_Contact_ID_TABLE.Contact_Status_ID <> 3)`,
      orderBy:
        "Participant_ID_TABLE_Contact_ID_TABLE.Last_Name, Participant_ID_TABLE_Contact_ID_TABLE.First_Name, Participant_ID_TABLE_Contact_ID_TABLE.Display_Name",
    });

    if (members.length === 0) return [];

    const participantIds = members.map((m) => m.Participant_ID);
    const milestonesByParticipant = await this.buildMilestonesForParticipants(participantIds, journeyId, congregationId);

    return members.map((m) => ({
      Participant_ID: m.Participant_ID,
      Contact_ID: m.Contact_ID,
      Display_Name: m.Display_Name,
      Nickname: m.Nickname,
      First_Name: m.First_Name,
      Last_Name: m.Last_Name,
      Milestones: milestonesByParticipant.get(m.Participant_ID) ?? [],
    }));
  }

  // ── User/household resolution (dp_Users -> Contacts -> Participants) ──

  private async resolveParticipantId(userGuid: string): Promise<number | null> {
    const contactId = await this.resolveContactId(userGuid);
    if (!contactId) return null;

    const contacts = await this.mp!.getTableRecords<ContactRecord>({
      table: "Contacts",
      select: "Participant_Record",
      filter: `Contact_ID = ${contactId}`,
      top: 1,
    });
    const participantRecord = contacts[0]?.Participant_Record;
    if (participantRecord) return participantRecord;

    const participants = await this.mp!.getTableRecords<{ Participant_ID: number }>({
      table: "Participants",
      select: "Participant_ID",
      filter: `Contact_ID = ${contactId}`,
      top: 1,
    });
    return participants[0]?.Participant_ID ?? null;
  }

  private async resolveContactId(userGuid: string): Promise<number | null> {
    const users = await this.mp!.getTableRecords<DpUserRecord>({
      table: "dp_Users",
      select: "Contact_ID",
      filter: `User_GUID = '${userGuid}' OR User_Name = '${userGuid}'`,
      top: 1,
    });
    return users[0]?.Contact_ID ?? null;
  }

  private async resolveHouseholdId(userGuid: string): Promise<number | null> {
    const users = await this.mp!.getTableRecords<{ Household_ID: number | null }>({
      table: "dp_Users",
      select: "Contact_ID_TABLE.Household_ID",
      filter: `User_GUID = '${userGuid}' OR User_Name = '${userGuid}'`,
      top: 1,
    });
    return users[0]?.Household_ID ?? null;
  }

  private async isCurrentGroupMember(participantId: number, groupId: number): Promise<boolean> {
    const rows = await this.mp!.getTableRecords<{ Group_Participant_ID: number }>({
      table: "Group_Participants",
      select: "Group_Participant_ID",
      filter:
        `Participant_ID = ${participantId} AND Group_ID = ${groupId} ` +
        `AND (Start_Date IS NULL OR Start_Date <= GETDATE()) ` +
        `AND (End_Date IS NULL OR End_Date > GETDATE())`,
      top: 1,
    });
    return rows.length > 0;
  }

  private async resolveGroupCongregation(groupId: number): Promise<number | null> {
    const groups = await this.mp!.getTableRecords<GroupRecord>({
      table: "Groups",
      select: "Congregation_ID",
      filter: `Group_ID = ${groupId}`,
      top: 1,
    });
    return groups[0]?.Congregation_ID ?? null;
  }

  // ── Milestone building (shared by individual + family) ──

  /**
   * For each given participant, every milestone in the journey (ordered by
   * Sort_Order, nulls last, matching the source procedure), with that
   * participant's achievement status/date and the congregation's form/event
   * link. Journeys have a handful of milestones and households/groups are
   * small, so — unlike the calendar widgets' event-ID lists — no batching
   * is needed for the IN (...) filters here.
   */
  private async buildMilestonesForParticipants(
    participantIds: number[],
    journeyId: number,
    congregationId: number | null
  ): Promise<Map<number, JourneyMilestone[]>> {
    const milestoneRows = await this.mp!.getTableRecords<MilestoneRecord>({
      table: "Milestones",
      select: "Milestone_ID, Milestone_Title, Icon, Sort_Order",
      filter: `Journey_ID = ${journeyId} AND Discontinued = 0`,
    });
    // Sort_Order nulls sort last (matching the source procedure's explicit
    // CASE WHEN ... THEN 1 ELSE 0 END ordering), then by title.
    milestoneRows.sort((a, b) => {
      const aOrder = a.Sort_Order ?? Number.POSITIVE_INFINITY;
      const bOrder = b.Sort_Order ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.Milestone_Title.localeCompare(b.Milestone_Title);
    });

    if (milestoneRows.length === 0) {
      return new Map(participantIds.map((id) => [id, []]));
    }

    const milestoneIds = milestoneRows.map((m) => m.Milestone_ID);

    const formsByMilestoneId = new Map<number, MilestoneFormRecord>();
    if (congregationId !== null) {
      const formRows = await this.mp!.getTableRecords<MilestoneFormRecord>({
        table: "Milestone_Forms",
        select: [
          "Milestone_Forms.Milestone_ID",
          "Milestone_Forms.Form_ID",
          "Form_ID_TABLE.Form_Title",
          "Form_ID_TABLE.Form_GUID",
          "Milestone_Forms.Event_ID",
          "Event_ID_TABLE.Event_Title",
        ].join(", "),
        filter: `Milestone_Forms.Congregation_ID = ${congregationId} AND Milestone_Forms.Milestone_ID IN (${milestoneIds.join(",")})`,
      });
      for (const row of formRows) formsByMilestoneId.set(row.Milestone_ID, row);
    }

    const achievedByParticipantAndMilestone = new Map<string, ParticipantMilestoneRecord>();
    if (participantIds.length > 0) {
      const participantMilestoneRows = await this.mp!.getTableRecords<ParticipantMilestoneRecord>({
        table: "Participant_Milestones",
        select: "Participant_Milestone_ID, Participant_ID, Milestone_ID, Date_Accomplished",
        filter: `Participant_ID IN (${participantIds.join(",")}) AND Milestone_ID IN (${milestoneIds.join(",")})`,
      });
      for (const row of participantMilestoneRows) {
        const key = `${row.Participant_ID}:${row.Milestone_ID}`;
        const existing = achievedByParticipantAndMilestone.get(key);
        if (!existing || this.isBetterMilestoneRecord(row, existing)) {
          achievedByParticipantAndMilestone.set(key, row);
        }
      }
    }

    const result = new Map<number, JourneyMilestone[]>();
    for (const participantId of participantIds) {
      const milestones: JourneyMilestone[] = milestoneRows.map((m) => {
        const achieved = achievedByParticipantAndMilestone.get(`${participantId}:${m.Milestone_ID}`);
        const form = formsByMilestoneId.get(m.Milestone_ID);
        return {
          Milestone_ID: m.Milestone_ID,
          Milestone_Title: m.Milestone_Title,
          Icon: m.Icon,
          Sort_Order: m.Sort_Order,
          Achieved: !!achieved,
          Date_Accomplished: achieved?.Date_Accomplished ? achieved.Date_Accomplished.slice(0, 10) : null,
          Form_ID: form?.Form_ID ?? null,
          Form_Title: form?.Form_Title ?? null,
          Form_GUID: form?.Form_GUID ?? null,
          Event_ID: form?.Event_ID ?? null,
          Event_Title: form?.Event_Title ?? null,
        };
      });
      result.set(participantId, milestones);
    }
    return result;
  }

  // "Best" = a dated record first, then the newest date, then the highest ID —
  // matching the source procedure's correlated-subquery ORDER BY exactly.
  private isBetterMilestoneRecord(candidate: ParticipantMilestoneRecord, current: ParticipantMilestoneRecord): boolean {
    const candidateDated = candidate.Date_Accomplished !== null;
    const currentDated = current.Date_Accomplished !== null;
    if (candidateDated !== currentDated) return candidateDated;
    if (candidateDated && currentDated && candidate.Date_Accomplished !== current.Date_Accomplished) {
      return candidate.Date_Accomplished! > current.Date_Accomplished!;
    }
    return candidate.Participant_Milestone_ID > current.Participant_Milestone_ID;
  }
}
