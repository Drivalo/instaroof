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
