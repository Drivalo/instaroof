export const JOB_TYPE_VALUES = ["emergency", "planned", "insurance"] as const;

export type JobType = (typeof JOB_TYPE_VALUES)[number];

export const JOB_TYPE_OPTIONS: ReadonlyArray<{
  value: JobType;
  emoji: string;
  label: string;
}> = [
  { value: "emergency", emoji: "🚨", label: "I have a leak or damage right now" },
  { value: "planned", emoji: "🔨", label: "I'm planning a roof replacement" },
  { value: "insurance", emoji: "📋", label: "I need a quote for insurance purposes" },
];

export function isValidJobType(value: unknown): value is JobType {
  return typeof value === "string" && (JOB_TYPE_VALUES as readonly string[]).includes(value);
}

export function jobTypeLabel(value: string | null | undefined): string {
  const match = JOB_TYPE_OPTIONS.find((o) => o.value === value);
  return match ? `${match.emoji} ${match.label}` : "—";
}

export function isEmergencyJobType(value: string | null | undefined): boolean {
  return value === "emergency";
}
