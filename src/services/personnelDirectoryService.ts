import { MPHelper } from "@/lib/providers/ministry-platform";
import type { PersonnelSummary, PersonnelAssignment } from "@mpnext/types";

// ── MP Record Types ──

interface PersonnelRow {
  Personnel_ID: number;
  Display_Name: string;
  Email_Address: string | null;
  Company_Phone: string | null;
  Mobile_Phone: string | null;
  Personnel_Category_ID: number;
  Contact_ID: number;
}

// Personnel_Categories is a MinistryPlatform "System Lookup" table — the
// mp.widgets.api service account's security role cannot be granted Read
// access to it (unlike ordinary tables), and it isn't meant to be
// customized per-tenant, so its 6 values are hardcoded here rather than
// joined via REST. If a tenant ever adds a 7th category, this map (and the
// PERSONNEL_CATEGORY_NAMES fallback below) would need a matching update.
const PERSONNEL_CATEGORY_NAMES: Record<number, string> = {
  1: "Catechist",
  2: "Clergy",
  3: "Religious",
  4: "Staff",
  5: "Volunteer",
  6: "Seminarian",
};

interface AssignmentRow {
  Personnel_Assignment_ID: number;
  Personnel_ID: number;
  Primary_Assignment: boolean;
  Assignment_Role: string | null;
  Location_Name: string | null;
  Location_Phone: string | null;
  Congregation_ID: number | null;
}

interface AlternateEmailRow {
  Contact_ID: number;
  Email_Address: string;
}

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

/** 1 = Company Phone, 2 = Location Phone, 3 = Mobile Phone — matches the classic widget's phoneSource values. */
export type PhoneSource = 1 | 2 | 3;

function resolvePhone(
  row: { Company_Phone: string | null; Mobile_Phone: string | null },
  locationPhone: string | null,
  phoneSource: PhoneSource,
  phoneStrictSource: boolean
): string | null {
  const bySource: Record<PhoneSource, string | null> = {
    1: row.Company_Phone,
    2: locationPhone,
    3: row.Mobile_Phone,
  };

  if (phoneStrictSource) {
    return bySource[phoneSource] || null;
  }

  // Non-strict: try the configured source first, then fall back through the
  // rest in a fixed order (Company, Mobile, Location) so a person is never
  // shown with no phone at all just because their preferred field is blank.
  const fallbackOrder: PhoneSource[] = [phoneSource, 1, 3, 2];
  for (const source of fallbackOrder) {
    if (bySource[source]) return bySource[source];
  }
  return null;
}

export class PersonnelDirectoryService {
  private static instance: PersonnelDirectoryService;
  private mp: MPHelper | null = null;
  private apiBaseUrl = "";

  private constructor() {
    this.initialize();
  }

  public static async getInstance(): Promise<PersonnelDirectoryService> {
    if (!PersonnelDirectoryService.instance) {
      PersonnelDirectoryService.instance = new PersonnelDirectoryService();
      await PersonnelDirectoryService.instance.initialize();
    }
    return PersonnelDirectoryService.instance;
  }

  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
    this.apiBaseUrl = (process.env.MINISTRY_PLATFORM_BASE_URL || "").replace(/\/$/, "");
  }

  /**
   * Public/optionally-gated directory of diocesan personnel — native
   * REST-query translation of the classic widget's
   * dbo.api_custom_PersonnelDirectory stored procedure.
   *
   * All name/role/location/category search happens client-side in the
   * widget over this full result set, matching the classic widget's own
   * "search matches name, role, location, category, and other assignments"
   * behavior.
   *
   * Photos are resolved via MP's native per-record file attachments (on
   * Contacts, same as the person's photo used elsewhere in this codebase)
   * rather than the classic widget's separate
   * `api_custom_PersonnelDirectory_Photos` helper view, so there's no
   * custom SQL to deploy on a fresh tenant.
   *
   * Personnel_Category names come from a hardcoded map (see
   * PERSONNEL_CATEGORY_NAMES above), not a REST join to Personnel_Categories
   * — that table is a MinistryPlatform "System Lookup" the widget's service
   * account can't be granted Read access to, and isn't meant to vary by
   * tenant anyway.
   */
  public async getPersonnel(params: {
    personnelCategoryIds?: number[];
    congregationIds?: number[];
    phoneSource?: PhoneSource;
    phoneStrictSource?: boolean;
    alternateEmailTypeId?: number;
  }): Promise<PersonnelSummary[]> {
    const {
      personnelCategoryIds,
      congregationIds,
      phoneSource = 1,
      phoneStrictSource = false,
      alternateEmailTypeId,
    } = params;

    // Active = not past its End Date and not terminated — mirrors the
    // classic procedure's use of Personnel.End_Date / Termination_Date.
    let filter =
      "(Personnel.End_Date IS NULL OR Personnel.End_Date > GETDATE()) " +
      "AND Personnel.Termination_Date IS NULL";
    if (personnelCategoryIds && personnelCategoryIds.length > 0) {
      filter += ` AND Personnel.Personnel_Category_ID IN (${personnelCategoryIds.join(",")})`;
    }
    if (congregationIds && congregationIds.length > 0) {
      filter += ` AND Personnel.Congregation_ID IN (${congregationIds.join(",")})`;
    }

    const rows = await this.mp!.getTableRecords<PersonnelRow>({
      table: "Personnel",
      select: [
        "Personnel.Personnel_ID",
        "Contact_ID_TABLE.Display_Name",
        "Contact_ID_TABLE.Email_Address",
        "Contact_ID_TABLE.Company_Phone",
        "Contact_ID_TABLE.Mobile_Phone",
        "Personnel.Personnel_Category_ID",
        "Personnel.Contact_ID",
      ].join(", "),
      filter,
      orderBy: "Contact_ID_TABLE.Display_Name",
    });

    if (rows.length === 0) return [];

    const personnelIds = rows.map((r) => r.Personnel_ID);
    const contactIds = rows.map((r) => r.Contact_ID);

    const [assignmentsByPersonnelId, alternateEmailByContactId, photoByContactId] = await Promise.all([
      this.getActiveAssignments(personnelIds),
      alternateEmailTypeId ? this.getAlternateEmails(contactIds, alternateEmailTypeId) : Promise.resolve(new Map<number, string>()),
      this.resolvePhotos(contactIds),
    ]);

    return rows.map((row) => {
      const assignments = assignmentsByPersonnelId.get(row.Personnel_ID) ?? [];
      // Some records have more than one assignment flagged Primary_Assignment
      // (a data-quality reality, not something this widget can enforce) —
      // deterministically treat the first one as "the" primary and list the
      // rest (including any other flagged-primary rows) as other assignments.
      const primaryIndex = assignments.findIndex((a) => a.Primary_Assignment);
      const primary = primaryIndex >= 0 ? assignments[primaryIndex] : undefined;
      const others = assignments.filter((_, i) => i !== primaryIndex);

      const phone = resolvePhone(row, primary?.Location_Phone ?? null, phoneSource, phoneStrictSource);
      const email = (alternateEmailTypeId && alternateEmailByContactId.get(row.Contact_ID)) || row.Email_Address || null;

      return {
        Personnel_ID: row.Personnel_ID,
        Display_Name: row.Display_Name,
        Personnel_Category_ID: row.Personnel_Category_ID,
        Personnel_Category: PERSONNEL_CATEGORY_NAMES[row.Personnel_Category_ID] ?? `Category ${row.Personnel_Category_ID}`,
        Photo_URL: photoByContactId.get(row.Contact_ID) ?? null,
        Phone: phone,
        Email: email,
        Primary_Role: primary?.Assignment_Role ?? null,
        Primary_Location: primary?.Location_Name ?? null,
        Primary_Congregation_ID: primary?.Congregation_ID ?? null,
        Other_Assignments: others.map(
          (a): PersonnelAssignment => ({
            Role: a.Assignment_Role,
            Location: a.Location_Name,
            Congregation_ID: a.Congregation_ID,
          })
        ),
      };
    });
  }

  private async getActiveAssignments(personnelIds: number[]): Promise<Map<number, AssignmentRow[]>> {
    const batches = await Promise.all(
      chunk(personnelIds, ID_BATCH_SIZE).map((batch) =>
        this.mp!.getTableRecords<AssignmentRow>({
          table: "Personnel_Assignments",
          select: [
            "Personnel_Assignment_ID",
            "Personnel_ID",
            "Primary_Assignment",
            "Assignment_Role_ID_TABLE.Assignment_Role",
            "Location_ID_TABLE.Location_Name",
            "Location_ID_TABLE.Phone AS Location_Phone",
            "Location_ID_TABLE.Congregation_ID",
          ].join(", "),
          filter: `Personnel_ID IN (${batch.join(",")}) AND (Assignment_End IS NULL OR Assignment_End > GETDATE())`,
          orderBy: "Personnel_ID, Primary_Assignment DESC, Personnel_Assignment_ID",
        })
      )
    );

    const map = new Map<number, AssignmentRow[]>();
    for (const row of batches.flat()) {
      const list = map.get(row.Personnel_ID);
      if (list) list.push(row);
      else map.set(row.Personnel_ID, [row]);
    }
    return map;
  }

  private async getAlternateEmails(contactIds: number[], alternateEmailTypeId: number): Promise<Map<number, string>> {
    const batches = await Promise.all(
      chunk(contactIds, ID_BATCH_SIZE).map((batch) =>
        this.mp!.getTableRecords<AlternateEmailRow>({
          table: "Alternate_Emails",
          select: "Contact_ID, Email_Address",
          filter: `Contact_ID IN (${batch.join(",")}) AND Alternate_Email_Type_ID = ${alternateEmailTypeId} AND Email_Address IS NOT NULL`,
        })
      )
    );
    return new Map(batches.flat().map((r) => [r.Contact_ID, r.Email_Address]));
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
