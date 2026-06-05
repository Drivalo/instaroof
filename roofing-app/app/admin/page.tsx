"use client";

import { format } from "date-fns";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_LEAD_STATUS_OPTIONS,
  normalizeAdminLeadStatus,
  type AdminLeadStatus,
} from "@/lib/admin-lead-status";
import { isEmergencyJobType, jobTypeEmoji, type JobType } from "@/lib/job-type";

type AdminLead = {
  id: number;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string;
  job_type: string | null;
  status: string | null;
  notes: string | null;
  guttering?: boolean | null;
  roof_material?: string | null;
  country_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  roof_sqft?: number | null;
  quote_standard_low?: number | null;
  quote_standard_high?: number | null;
  inspection_datetime?: string | null;
  deposit_paid?: boolean | null;
  best_time_to_contact?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

type StatusFilter = "all" | AdminLeadStatus;
type JobTypeFilter = "all" | JobType;

const JOB_TYPE_FILTERS: ReadonlyArray<{ value: JobTypeFilter; label: string }> = [
  { value: "all", label: "All job types" },
  { value: "emergency", label: "Emergency" },
  { value: "planned", label: "Planned" },
  { value: "insurance", label: "Insurance" },
];

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  ...ADMIN_LEAD_STATUS_OPTIONS.map((o) => ({ value: o.value as StatusFilter, label: o.label })),
];

const inputClass =
  "w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent";
const selectClass =
  "rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent";

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "—";
}

function formatSubmittedAt(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

function formatSubmittedAtDetail(iso: string): string {
  try {
    return format(new Date(iso), "MMM d, yyyy h:mm a");
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jobTypeFilter, setJobTypeFilter] = useState<JobTypeFilter>("all");
  const [hasContactInfoOnly, setHasContactInfoOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<number | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<number | null>(null);

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    setLoginError("");
    try {
      const res = await fetch("/api/admin/leads");
      if (res.status === 401) {
        setAuthed(false);
        return false;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load leads");
      }
      const rows = (data.leads ?? []) as AdminLead[];
      setLeads(rows);
      setNotesDraft(
        Object.fromEntries(rows.map((l) => [l.id, l.notes ?? ""])),
      );
      setAuthed(true);
      return true;
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Failed to load leads");
      setAuthed(false);
      return false;
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads().finally(() => setCheckingSession(false));
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && normalizeAdminLeadStatus(lead.status) !== statusFilter) {
        return false;
      }
      if (jobTypeFilter !== "all" && lead.job_type !== jobTypeFilter) {
        return false;
      }
      if (hasContactInfoOnly && !lead.name?.trim()) {
        return false;
      }
      if (q) {
        const name = (lead.name ?? "").toLowerCase();
        const address = lead.address.toLowerCase();
        if (!name.includes(q) && !address.includes(q)) return false;
      }
      return true;
    });
  }, [leads, statusFilter, jobTypeFilter, hasContactInfoOnly, searchQuery]);

  async function patchLead(
    leadId: number,
    patch: { status?: AdminLeadStatus; notes?: string },
  ): Promise<boolean> {
    const res = await fetch(`/api/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoginError(data.error || "Failed to update lead");
      return false;
    }
    if (data.lead) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...data.lead } : l)));
    }
    return true;
  }

  async function handleStatusChange(leadId: number, status: AdminLeadStatus) {
    setSavingStatusId(leadId);
    setLoginError("");
    const ok = await patchLead(leadId, { status });
    if (!ok) await loadLeads();
    setSavingStatusId(null);
  }

  async function saveNotes(leadId: number) {
    const notes = notesDraft[leadId] ?? "";
    const lead = leads.find((l) => l.id === leadId);
    if (lead && (lead.notes ?? "") === notes) return;

    setSavingNotesId(leadId);
    setLoginError("");
    const ok = await patchLead(leadId, { notes });
    if (!ok) {
      const current = leads.find((l) => l.id === leadId);
      if (current) setNotesDraft((d) => ({ ...d, [leadId]: current.notes ?? "" }));
    }
    setSavingNotesId(null);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setLoginError(data.error || "Invalid password");
      return;
    }
    setPassword("");
    await loadLeads();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setLeads([]);
    setExpandedId(null);
  }

  if (checkingSession) {
    return (
      <main className="customer-page min-h-screen bg-background text-foreground">
        <div className="container-max py-12">
          <p className="text-muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="customer-page min-h-screen bg-background text-foreground">
        <div className="container-max py-12 max-w-md">
          <h1 className="text-2xl">Admin</h1>
          <p className="mt-2 text-sm text-muted">Sign in with your admin password.</p>
          <form onSubmit={login} className="mt-8 space-y-4">
            <div>
              <label htmlFor="admin-password" className="block text-sm text-muted mb-1.5">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Admin password"
              />
            </div>
            {loginError ? <p className="text-sm text-red-400">{loginError}</p> : null}
            <button type="submit" className="btn-accent w-full rounded-lg px-4 py-3 tracking-wide">
              Sign in
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="customer-page min-h-screen bg-background text-foreground">
      <header className="border-b border-border-subtle">
        <div className="container-max py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl">Leads</h1>
            <p className="mt-1 text-sm text-muted">
              <span className="text-foreground font-medium">{filteredLeads.length}</span>
              {filteredLeads.length === 1 ? " lead" : " leads"}
              {statusFilter !== "all" ||
              jobTypeFilter !== "all" ||
              hasContactInfoOnly ||
              searchQuery.trim()
                ? " matching filters"
                : " total"}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadLeads()}
              disabled={loadingLeads}
              className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm text-foreground hover:border-accent disabled:opacity-50"
            >
              {loadingLeads ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm text-foreground hover:border-accent"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="container-max py-6 space-y-4">
        {loginError ? <p className="text-sm text-red-400">{loginError}</p> : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="admin-search" className="block text-sm text-muted mb-1.5">
              Search name or address
            </label>
            <input
              id="admin-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={inputClass}
              placeholder="Start typing…"
            />
          </div>
          <div>
            <label htmlFor="admin-status-filter" className="block text-sm text-muted mb-1.5">
              Status
            </label>
            <select
              id="admin-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={selectClass}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="admin-job-filter" className="block text-sm text-muted mb-1.5">
              Job type
            </label>
            <select
              id="admin-job-filter"
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value as JobTypeFilter)}
              className={selectClass}
            >
              {JOB_TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="pb-2">
            <label
              htmlFor="admin-contact-filter"
              className="flex items-center gap-2 text-sm text-foreground cursor-pointer whitespace-nowrap"
            >
              <input
                id="admin-contact-filter"
                type="checkbox"
                checked={hasContactInfoOnly}
                onChange={(e) => setHasContactInfoOnly(e.target.checked)}
                className="h-4 w-4 rounded border-border-subtle bg-background accent-[#F5A623]"
              />
              Has contact info only
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
          <table className="min-w-[1300px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-muted">
                <th className="px-4 py-3 font-normal whitespace-nowrap">Date</th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal min-w-[180px]">Address</th>
                <th className="px-4 py-3 font-normal">Job type</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Roof material</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Guttering</th>
                <th className="px-4 py-3 font-normal whitespace-nowrap">Status</th>
                <th className="px-4 py-3 font-normal min-w-[200px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">
                    No leads match your filters.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const urgent = isEmergencyJobType(lead.job_type);
                  const expanded = expandedId === lead.id;
                  const notesValue = notesDraft[lead.id] ?? lead.notes ?? "";
                  const notesDirty = notesValue !== (lead.notes ?? "");

                  return (
                    <Fragment key={lead.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : lead.id)}
                        className={`border-b border-border-subtle cursor-pointer transition-colors hover:bg-background/60 ${
                          urgent
                            ? "bg-amber-950/35 border-l-4 border-l-amber-500"
                            : expanded
                              ? "bg-background/40"
                              : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {formatSubmittedAt(lead.created_at)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          <div className="flex flex-col gap-1">
                            <span>{displayValue(lead.name)}</span>
                            {urgent ? (
                              <span className="inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-xs font-medium text-amber-300">
                                ⚠️ URGENT
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {displayValue(lead.phone)}
                        </td>
                        <td className="px-4 py-3 text-foreground break-all max-w-[200px]">
                          {displayValue(lead.email)}
                        </td>
                        <td className="px-4 py-3 text-foreground">{lead.address}</td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          <span title={lead.job_type ?? undefined}>
                            {jobTypeEmoji(lead.job_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {displayValue(lead.roof_material)}
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {lead.guttering == null ? "—" : lead.guttering ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={normalizeAdminLeadStatus(lead.status)}
                            disabled={savingStatusId === lead.id}
                            onChange={(e) =>
                              void handleStatusChange(lead.id, e.target.value as AdminLeadStatus)
                            }
                            className={`${selectClass} min-w-[140px] disabled:opacity-50`}
                            aria-label={`Status for ${displayValue(lead.name)}`}
                          >
                            {ADMIN_LEAD_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-2 min-w-[180px]">
                            <textarea
                              rows={2}
                              value={notesValue}
                              onChange={(e) =>
                                setNotesDraft((d) => ({ ...d, [lead.id]: e.target.value }))
                              }
                              onBlur={() => void saveNotes(lead.id)}
                              className={`${inputClass} resize-y min-h-[52px]`}
                              placeholder="Add notes…"
                              aria-label={`Notes for ${displayValue(lead.name)}`}
                            />
                            {notesDirty ? (
                              <button
                                type="button"
                                onClick={() => void saveNotes(lead.id)}
                                disabled={savingNotesId === lead.id}
                                className="self-start rounded-lg border border-accent bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
                              >
                                {savingNotesId === lead.id ? "Saving…" : "Save notes"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr key={`${lead.id}-detail`} className="border-b border-border-subtle bg-background/50">
                          <td colSpan={10} className="px-4 py-4">
                            <LeadDetailPanel lead={lead} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Click a row to expand full lead details.</p>
      </div>
    </main>
  );
}

function LeadDetailPanel({ lead }: { lead: AdminLead }) {
  const urgent = isEmergencyJobType(lead.job_type);
  const rows: Array<{ label: string; value: string }> = [
    { label: "Lead ID", value: String(lead.id) },
    { label: "Submitted", value: formatSubmittedAtDetail(lead.created_at) },
    { label: "Name", value: displayValue(lead.name) },
    { label: "Phone", value: displayValue(lead.phone) },
    { label: "Email", value: displayValue(lead.email) },
    { label: "Address", value: lead.address },
    { label: "Job type", value: displayValue(lead.job_type) },
    { label: "Roof material", value: displayValue(lead.roof_material) },
    { label: "Guttering", value: lead.guttering == null ? "—" : lead.guttering ? "Yes" : "No" },
    { label: "Status", value: normalizeAdminLeadStatus(lead.status) },
    { label: "Notes", value: displayValue(lead.notes) },
    { label: "Country", value: displayValue(lead.country_code) },
    {
      label: "Roof size (sq ft)",
      value: lead.roof_sqft != null ? String(lead.roof_sqft) : "—",
    },
    {
      label: "Quote range",
      value:
        lead.quote_standard_low != null || lead.quote_standard_high != null
          ? `${lead.quote_standard_low ?? "—"} – ${lead.quote_standard_high ?? "—"}`
          : "—",
    },
    {
      label: "Inspection",
      value: lead.inspection_datetime
        ? formatSubmittedAtDetail(lead.inspection_datetime)
        : "—",
    },
    { label: "Deposit paid", value: lead.deposit_paid ? "Yes" : "No" },
    { label: "Best time to contact", value: displayValue(lead.best_time_to_contact) },
    {
      label: "UTM",
      value: [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") || "—",
    },
    {
      label: "Coordinates",
      value:
        lead.latitude != null && lead.longitude != null
          ? `${lead.latitude}, ${lead.longitude}`
          : "—",
    },
  ];

  return (
    <div
      className={`rounded-lg border p-4 ${
        urgent ? "border-amber-500/50 bg-amber-950/25" : "border-border-subtle bg-surface"
      }`}
    >
      {urgent ? (
        <p className="mb-3 text-sm font-medium text-amber-300">
          ⚠️ URGENT — customer reported an active leak or damage
        </p>
      ) : null}
      <h3 className="text-sm text-foreground mb-3">Lead details</h3>
      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[minmax(0,140px)_1fr] gap-2">
            <dt className="text-muted">{row.label}</dt>
            <dd className="text-foreground break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
