import { format } from "date-fns";

/** Parse slot or ISO string and store as UTC ISO for Supabase TIMESTAMPTZ. */
export function normalizeInspectionDatetime(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error("Inspection date and time are required");
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid inspection date and time");
  }
  return parsed.toISOString();
}

export function formatInspectionSchedule(iso: string): {
  date: string;
  time: string;
  combined: string;
} {
  const dt = new Date(iso);
  return {
    date: format(dt, "EEEE, MMMM d, yyyy"),
    time: format(dt, "h:mm a"),
    combined: format(dt, "EEEE, MMMM d, yyyy 'at' h:mm a"),
  };
}

export type PreferredInspectionTime = "morning" | "afternoon" | "either";

export function isPreferredInspectionTime(value: string): value is PreferredInspectionTime {
  return value === "morning" || value === "afternoon" || value === "either";
}

export function preferredInspectionTimeLabel(preference: PreferredInspectionTime): string {
  if (preference === "morning") return "Morning";
  if (preference === "afternoon") return "Afternoon";
  return "Morning or afternoon";
}

/** Map preferred date + time window to a stored inspection datetime. */
export function buildPreferredInspectionIso(
  preferredDate: string,
  preference: PreferredInspectionTime,
): string {
  const hour = preference === "morning" ? 9 : preference === "afternoon" ? 13 : 10;
  return normalizeInspectionDatetime(`${preferredDate}T${String(hour).padStart(2, "0")}:00:00`);
}
