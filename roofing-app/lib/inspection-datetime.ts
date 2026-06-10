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

export const INSPECTION_START_HOUR = 8;
export const INSPECTION_END_HOUR = 17;

function formatHourLabel(hour: number): string {
  return format(new Date(2000, 0, 1, hour, 0, 0), "h:mm a");
}

export const INSPECTION_HOUR_OPTIONS = Array.from(
  { length: INSPECTION_END_HOUR - INSPECTION_START_HOUR + 1 },
  (_, index) => {
    const hour = INSPECTION_START_HOUR + index;
    return {
      value: String(hour).padStart(2, "0"),
      label: formatHourLabel(hour),
    };
  },
);

export function isInspectionHourSlot(value: string): boolean {
  const hour = Number.parseInt(value, 10);
  return (
    Number.isInteger(hour) &&
    hour >= INSPECTION_START_HOUR &&
    hour <= INSPECTION_END_HOUR
  );
}

export function inspectionHourLabel(hourSlot: string): string {
  const hour = Number.parseInt(hourSlot, 10);
  if (!isInspectionHourSlot(hourSlot)) {
    throw new Error("Invalid inspection hour");
  }
  return formatHourLabel(hour);
}

/** Map preferred date + hour slot to a stored inspection datetime. */
export function buildPreferredInspectionIso(preferredDate: string, hourSlot: string): string {
  const hour = Number.parseInt(hourSlot, 10);
  if (!isInspectionHourSlot(hourSlot)) {
    throw new Error("Invalid inspection hour");
  }
  return normalizeInspectionDatetime(`${preferredDate}T${String(hour).padStart(2, "0")}:00:00`);
}
