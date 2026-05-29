"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { getCurrencyDisplay } from "@/lib/currency";
import { SettingsRow } from "@/lib/types";

type LeadRow = {
  id: number;
  created_at: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  roof_sqft: number | null;
  quote_standard_low: number | null;
  quote_standard_high: number | null;
  status: string;
};

function roofSizeSqm(roofSqft: number | null | undefined): string {
  if (roofSqft == null || !Number.isFinite(Number(roofSqft))) return "—";
  const sqm = Math.round(Number(roofSqft) * 0.092903);
  return `${sqm.toLocaleString("en-US")} m²`;
}

function formatPriceRange(lead: LeadRow, settings: SettingsRow | null): string {
  const low = lead.quote_standard_low;
  const high = lead.quote_standard_high;
  if (low == null && high == null) return "—";
  const display = getCurrencyDisplay(
    lead.address,
    settings,
    lead.country_code,
    lead.latitude,
    lead.longitude,
  );
  return display.formatRange(low ?? 0, high ?? 0);
}

function formatSubmittedAt(iso: string): string {
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
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [settings, setSettings] = useState<SettingsRow | null>(null);

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
      setLeads(data.leads ?? []);
      setSettings(data.settings ?? null);
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
    setSettings(null);
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
                className="w-full rounded-lg border border-border-subtle bg-surface px-4 py-3 text-foreground placeholder:text-muted/70 focus:outline-none focus:border-accent"
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
              {leads.length} {leads.length === 1 ? "lead" : "leads"} · newest first
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

      <div className="container-max py-8">
        {loginError ? <p className="mb-4 text-sm text-red-400">{loginError}</p> : null}

        <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-muted">
                <th className="px-4 py-3 font-normal">ID</th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Phone</th>
                <th className="px-4 py-3 font-normal min-w-[200px]">Address</th>
                <th className="px-4 py-3 font-normal">Roof size</th>
                <th className="px-4 py-3 font-normal min-w-[140px]">Price range</th>
                <th className="px-4 py-3 font-normal min-w-[160px]">Submitted</th>
                <th className="px-4 py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    No leads yet.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-4 py-3 text-foreground">{lead.id}</td>
                    <td className="px-4 py-3 text-foreground">{lead.name?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-foreground break-all">{lead.email?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {lead.phone?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground">{lead.address}</td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {roofSizeSqm(lead.roof_sqft)}
                    </td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {formatPriceRange(lead, settings)}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {formatSubmittedAt(lead.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full border border-border-subtle bg-background px-2.5 py-0.5 text-xs text-foreground capitalize">
                        {lead.status || "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
