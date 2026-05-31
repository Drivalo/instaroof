export const ADMIN_LEAD_STATUS_VALUES = ["new", "contacted", "quoted", "won", "lost"] as const;

export type AdminLeadStatus = (typeof ADMIN_LEAD_STATUS_VALUES)[number];

export const ADMIN_LEAD_STATUS_OPTIONS: ReadonlyArray<{ value: AdminLeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export function isValidAdminLeadStatus(value: unknown): value is AdminLeadStatus {
  return typeof value === "string" && (ADMIN_LEAD_STATUS_VALUES as readonly string[]).includes(value);
}

/** Map legacy pipeline statuses to admin CRM statuses for display and filtering. */
export function normalizeAdminLeadStatus(value: string | null | undefined): AdminLeadStatus {
  const s = value?.trim().toLowerCase();
  if (!s) return "new";
  if (isValidAdminLeadStatus(s)) return s;
  if (s === "booked" || s === "inspected") return "contacted";
  if (s === "quoted") return "quoted";
  if (s === "won") return "won";
  if (s === "lost") return "lost";
  return "new";
}

export function adminLeadStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeAdminLeadStatus(value);
  return ADMIN_LEAD_STATUS_OPTIONS.find((o) => o.value === normalized)?.label ?? "New";
}
