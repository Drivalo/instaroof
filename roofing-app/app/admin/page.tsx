"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Image from "next/image";
import { DragEvent, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tabs = ["dashboard", "leads", "schedule", "settings", "analytics"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_SLOTS = ["09:00", "11:00", "13:00", "15:00"];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<(typeof tabs)[number]>("dashboard");
  const [data, setData] = useState<any>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState<any[]>([]);
  const [testimonialsDraft, setTestimonialsDraft] = useState<any[]>([]);

  async function loadAdminData() {
    const adminData = await fetch("/api/admin/data").then((r) => r.json());
    setData(adminData);
    const availByDay = new Map<number, any>((adminData.availability || []).map((r: any) => [Number(r.day_of_week), r]));
    const normalized = DAY_NAMES.map((_, day) => {
      const row = availByDay.get(day);
      return {
        day_of_week: day,
        time_slots: row?.time_slots?.length ? row.time_slots : day === 0 ? [] : [...DEFAULT_SLOTS],
        blackout_dates: row?.blackout_dates || [],
      };
    });
    setAvailabilityDraft(normalized);
    setTestimonialsDraft(
      (adminData.testimonials || []).length
        ? adminData.testimonials
        : [
            { name: "Sarah J.", location: "Austin, TX", quote_text: "Fast and accurate quote - booked in minutes.", rating: 5, photo_url: "" },
            { name: "Mike R.", location: "Dallas, TX", quote_text: "Loved seeing the estimate instantly.", rating: 5, photo_url: "" },
            { name: "Priya K.", location: "Houston, TX", quote_text: "Easy process and no sales pressure.", rating: 5, photo_url: "" },
          ],
    );
  }

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
      await loadAdminData();
    } else {
      alert("Invalid admin password");
    }
  }

  async function saveSettings(payload: any) {
    await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_settings", id: data.settings.id, payload }),
    });
  }

  async function updateLead(id: number, payload: any) {
    await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_lead", id, payload }),
    });
    await loadAdminData();
  }

  async function uploadLogo(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/upload-logo", { method: "POST", body: formData });
    const payload = await res.json();
    if (!res.ok) {
      alert(payload.error || "Upload failed");
      return;
    }
    await saveSettings({ company_logo_url: payload.logoUrl });
    setData({
      ...data,
      settings: { ...data.settings, company_logo_url: payload.logoUrl },
    });
  }

  function onLogoDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadLogo(file);
  }

  async function saveAvailability() {
    await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace_availability", payload: availabilityDraft }),
    });
    alert("Availability saved");
    await loadAdminData();
  }

  async function saveTestimonials() {
    const payload = testimonialsDraft.map((t) => ({
      name: t.name || "Customer",
      location: t.location || "Local",
      quote_text: t.quote_text || "",
      rating: Number(t.rating || 5),
      photo_url: t.photo_url || "",
    }));
    await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace_testimonials", payload }),
    });
    alert("Testimonials saved");
    await loadAdminData();
  }

  const chartData = useMemo(() => {
    if (!data?.leads) return [];
    const byDay = new Map<string, number>();
    for (const lead of data.leads) {
      const key = lead.created_at.slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    }
    return Array.from(byDay.entries()).map(([date, leads]) => ({ date, leads }));
  }, [data]);

  if (!authed) {
    return (
      <main className="container-max py-16 max-w-md">
        <h1 className="text-3xl font-bold">Admin Login</h1>
        <input type="password" className="w-full border rounded-lg p-3 mt-4" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={login} className="mt-4 w-full rounded-lg bg-[#1F2937] text-white p-3">Log in</button>
      </main>
    );
  }
  if (!data) return <main className="container-max py-10">Loading dashboard...</main>;

  return (
    <main className="container-max py-8">
      <h1 className="text-3xl font-bold mb-4">InstaRoof Quote Admin</h1>
      <div className="flex gap-2 flex-wrap mb-6">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 ${tab === t ? "bg-[#1F2937] text-white" : "bg-zinc-200"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <section className="space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white border"><p>Leads today</p><p className="text-2xl font-bold">{data.metrics.leadsToday}</p></div>
            <div className="p-4 rounded-xl bg-white border"><p>Bookings today</p><p className="text-2xl font-bold">{data.metrics.bookingsToday}</p></div>
            <div className="p-4 rounded-xl bg-white border"><p>Revenue today</p><p className="text-2xl font-bold">${data.metrics.revenueToday}</p></div>
            <div className="p-4 rounded-xl bg-white border"><p>Quote-to-booking</p><p className="text-2xl font-bold">{data.metrics.conversionRateWeek}%</p></div>
          </div>
          <div className="rounded-xl border bg-white p-4 h-72">
            <h3 className="font-semibold mb-2">Leads per day (30 days)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line dataKey="leads" stroke="#C8102E" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Hot Leads</h3>
            {data.leads
              .filter((l: any) => l.status === "quoted")
              .slice(0, 10)
              .map((l: any) => (
                <div key={l.id} className="flex justify-between border-b py-2">
                  <p>{l.address}</p>
                  <a href={`tel:${l.phone || ""}`} className="text-blue-600">Call now</a>
                </div>
              ))}
          </div>
        </section>
      )}

      {tab === "leads" && (
        <section className="rounded-xl border bg-white p-4 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr><th>Date</th><th>Address</th><th>Sq Ft</th><th>Quote Range</th><th>Status</th><th>Deposit</th></tr></thead>
            <tbody>
              {data.leads.map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td>{l.created_at.slice(0, 10)}</td>
                  <td>{l.address}</td>
                  <td>{l.roof_sqft || "-"}</td>
                  <td>${l.quote_standard_low || 0}-${l.quote_standard_high || 0}</td>
                  <td>{l.status}</td>
                  <td>{l.deposit_paid ? "Y" : "N"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => {
              const headers = ["date,address,sqft,quote_low,quote_high,status,deposit_paid"];
              const rows = data.leads.map((l: any) =>
                `${l.created_at},${JSON.stringify(l.address)},${l.roof_sqft || ""},${l.quote_standard_low || ""},${l.quote_standard_high || ""},${l.status},${l.deposit_paid}`,
              );
              const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "leads.csv";
              a.click();
            }}
            className="mt-4 rounded-lg bg-[#1F2937] text-white px-4 py-2"
          >
            Export CSV
          </button>
        </section>
      )}

      {tab === "schedule" && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          {data.leads.filter((l: any) => l.inspection_datetime).map((l: any) => (
            <div key={l.id} className="rounded-lg border p-3">
              <p className="font-semibold">{l.name || "Customer"} - {new Date(l.inspection_datetime).toLocaleString()}</p>
              <p>{l.address}</p>
              <div className="flex gap-4 mt-2">
                <a href={`https://maps.google.com/?q=${encodeURIComponent(l.address)}`} target="_blank">Get directions</a>
                <button onClick={() => updateLead(l.id, { status: "inspected" })} className="text-blue-600">Mark as completed</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "settings" && (
        <section className="rounded-xl border bg-white p-4 space-y-3">
          <h3 className="font-semibold">Branding</h3>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onLogoDrop}
            className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm"
          >
            <p className="mb-2 font-medium">Logo uploader (drag and drop)</p>
            {data.settings.company_logo_url ? (
              <Image
                src={data.settings.company_logo_url}
                alt="Company logo"
                width={180}
                height={64}
                unoptimized
                className="h-16 w-auto rounded bg-white p-1"
              />
            ) : (
              <p className="text-zinc-600">Drop a PNG/JPG here or pick a file below.</p>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="mt-3"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
          </div>
          <input className="w-full border rounded p-2" defaultValue={data.settings.company_name} onBlur={(e) => saveSettings({ company_name: e.target.value })} />
          <input className="w-full border rounded p-2" defaultValue={data.settings.company_phone} onBlur={(e) => saveSettings({ company_phone: e.target.value })} />
          <input className="w-full border rounded p-2" defaultValue={data.settings.company_email} onBlur={(e) => saveSettings({ company_email: e.target.value })} />
          <input className="w-full border rounded p-2" defaultValue={data.settings.primary_color} onBlur={(e) => saveSettings({ primary_color: e.target.value })} />
          <h3 className="font-semibold mt-4">Integrations</h3>
          <input className="w-full border rounded p-2" placeholder="Stripe publishable key" onBlur={(e) => saveSettings({ stripe_publishable_key: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Stripe secret key" onBlur={(e) => saveSettings({ stripe_secret_key: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Google Maps API key" onBlur={(e) => saveSettings({ google_maps_api_key: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Twilio SID" onBlur={(e) => saveSettings({ twilio_account_sid: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Twilio Auth Token" onBlur={(e) => saveSettings({ twilio_auth_token: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Twilio From Number" onBlur={(e) => saveSettings({ twilio_from_number: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Facebook Pixel ID" onBlur={(e) => saveSettings({ facebook_pixel_id: e.target.value })} />
          <input className="w-full border rounded p-2" placeholder="Google Ads Tag" onBlur={(e) => saveSettings({ google_ads_tag: e.target.value })} />

          <h3 className="font-semibold mt-6">Availability editor</h3>
          <p className="text-sm text-zinc-600">Pick weekly time slots and blackout dates (YYYY-MM-DD comma-separated).</p>
          <div className="space-y-3">
            {availabilityDraft.map((row, idx) => {
              const selected = new Set<string>(row.time_slots || []);
              return (
                <div key={row.day_of_week} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{DAY_NAMES[row.day_of_week]}</p>
                    <label className="text-sm flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(row.time_slots || []).length > 0}
                        onChange={(e) => {
                          const next = [...availabilityDraft];
                          next[idx] = {
                            ...row,
                            time_slots: e.target.checked ? [...DEFAULT_SLOTS] : [],
                          };
                          setAvailabilityDraft(next);
                        }}
                      />
                      Open
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                    {DEFAULT_SLOTS.map((slot) => (
                      <label key={slot} className="text-sm flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(slot)}
                          onChange={(e) => {
                            const next = [...availabilityDraft];
                            const set = new Set<string>(row.time_slots || []);
                            if (e.target.checked) set.add(slot);
                            else set.delete(slot);
                            next[idx] = { ...row, time_slots: Array.from(set).sort() };
                            setAvailabilityDraft(next);
                          }}
                        />
                        {slot}
                      </label>
                    ))}
                  </div>
                  <input
                    className="mt-2 w-full border rounded p-2 text-sm"
                    placeholder="Custom slot (HH:MM), press Enter to add"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const value = (e.currentTarget.value || "").trim();
                      if (!value) return;
                      const next = [...availabilityDraft];
                      const set = new Set<string>(row.time_slots || []);
                      set.add(value);
                      next[idx] = { ...row, time_slots: Array.from(set).sort() };
                      setAvailabilityDraft(next);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    className="mt-2 w-full border rounded p-2 text-sm"
                    defaultValue={(row.blackout_dates || []).join(",")}
                    placeholder="Blackout dates: 2026-06-12,2026-06-22"
                    onBlur={(e) => {
                      const dates = e.target.value
                        .split(",")
                        .map((d) => d.trim())
                        .filter(Boolean);
                      const next = [...availabilityDraft];
                      next[idx] = { ...row, blackout_dates: dates };
                      setAvailabilityDraft(next);
                    }}
                  />
                </div>
              );
            })}
          </div>
          <button onClick={saveAvailability} className="rounded-lg bg-[#1F2937] text-white px-4 py-2">
            Save availability
          </button>

          <h3 className="font-semibold mt-6">Testimonials (full CRUD)</h3>
          <div className="space-y-3">
            {testimonialsDraft.map((t, idx) => (
              <div key={`testimonial-${idx}`} className="rounded-lg border p-3 space-y-2">
                <div className="grid md:grid-cols-2 gap-2">
                  <input
                    className="border rounded p-2"
                    value={t.name || ""}
                    placeholder="Name"
                    onChange={(e) => {
                      const next = [...testimonialsDraft];
                      next[idx] = { ...t, name: e.target.value };
                      setTestimonialsDraft(next);
                    }}
                  />
                  <input
                    className="border rounded p-2"
                    value={t.location || ""}
                    placeholder="Location"
                    onChange={(e) => {
                      const next = [...testimonialsDraft];
                      next[idx] = { ...t, location: e.target.value };
                      setTestimonialsDraft(next);
                    }}
                  />
                </div>
                <textarea
                  className="w-full border rounded p-2"
                  rows={3}
                  value={t.quote_text || ""}
                  placeholder="Quote text"
                  onChange={(e) => {
                    const next = [...testimonialsDraft];
                    next[idx] = { ...t, quote_text: e.target.value };
                    setTestimonialsDraft(next);
                  }}
                />
                <div className="grid md:grid-cols-2 gap-2">
                  <input
                    className="border rounded p-2"
                    type="number"
                    min={1}
                    max={5}
                    value={t.rating || 5}
                    onChange={(e) => {
                      const next = [...testimonialsDraft];
                      next[idx] = { ...t, rating: Number(e.target.value || 5) };
                      setTestimonialsDraft(next);
                    }}
                  />
                  <input
                    className="border rounded p-2"
                    value={t.photo_url || ""}
                    placeholder="Photo URL (optional)"
                    onChange={(e) => {
                      const next = [...testimonialsDraft];
                      next[idx] = { ...t, photo_url: e.target.value };
                      setTestimonialsDraft(next);
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    const next = testimonialsDraft.filter((_: any, i: number) => i !== idx);
                    setTestimonialsDraft(next.length ? next : []);
                  }}
                  className="text-red-600 text-sm"
                >
                  Delete testimonial
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setTestimonialsDraft([
                  ...testimonialsDraft,
                  { name: "", location: "", quote_text: "", rating: 5, photo_url: "" },
                ])
              }
              className="rounded-lg border px-4 py-2"
            >
              Add testimonial
            </button>
            <button onClick={saveTestimonials} className="rounded-lg bg-[#1F2937] text-white px-4 py-2">
              Save testimonials
            </button>
          </div>
        </section>
      )}

      {tab === "analytics" && (
        <section className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Funnel</h3>
            <p>Visitors -&gt; Address entered -&gt; Quote generated -&gt; Booking started -&gt; Deposit paid -&gt; Inspected -&gt; Won</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Averages</h3>
            <p>Average quote value: ${Math.round(data.leads.reduce((s: number, l: any) => s + (Number(l.quote_standard_low || 0) + Number(l.quote_standard_high || 0)) / 2, 0) / Math.max(data.leads.length, 1))}</p>
            <p>Lead source tracking from utm_source/utm_medium/utm_campaign is stored on each lead record.</p>
          </div>
        </section>
      )}
    </main>
  );
}
