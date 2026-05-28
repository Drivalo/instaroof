"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [lead, setLead] = useState<any>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/leads/${id}`)
      .then((r) => r.json())
      .then((d) => setLead(d.lead));
  }, [id]);

  const squares = useMemo(() => (lead?.roof_sqft ? (Number(lead.roof_sqft) / 100).toFixed(1) : "0"), [lead]);

  if (!lead) return <main className="container-max py-10">Loading quote...</main>;

  return (
    <main className="container-max py-8">
      <div className="relative w-full max-w-[600px]">
        <Image
          src={lead.satellite_image_url}
          alt="Satellite"
          width={600}
          height={600}
          unoptimized
          className="w-full h-auto rounded-xl border"
        />
        <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full">
          <polygon
            points={(lead.polygon_coordinates || []).map((p: any) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(200, 16, 46, 0.35)"
            stroke="rgba(200,16,46,0.9)"
            strokeWidth="3"
          />
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mt-6">
        <p className="rounded-lg bg-white border p-3">Estimated roof area: <strong>{lead.roof_sqft} sq ft</strong></p>
        <p className="rounded-lg bg-white border p-3">Estimated squares: <strong>{squares}</strong></p>
        <p className="rounded-lg bg-white border p-3">Detected roof type: <strong>{lead.roof_type}</strong></p>
        <p className="rounded-lg bg-white border p-3">Complexity: <strong>{lead.roof_complexity}</strong></p>
      </div>

      {lead.vision_confidence < 50 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
          Your roof has complex features - your final quote may vary significantly from this estimate.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Repair Estimate</h3>
          <p className="text-2xl font-bold">${lead.quote_repair_low} - ${lead.quote_repair_high}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Full Replacement - Standard</h3>
          <p className="text-2xl font-bold">${lead.quote_standard_low} - ${lead.quote_standard_high}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="font-semibold">Full Replacement - Premium</h3>
          <p className="text-2xl font-bold">${lead.quote_premium_low} - ${lead.quote_premium_high}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-zinc-600">
        Estimate based on AI satellite analysis. Final pricing confirmed at free in-person inspection.
      </p>

      <Link href={`/book/${id}`} className="inline-block mt-6 rounded-xl bg-[#C8102E] px-6 py-4 text-white font-semibold">
        Lock In Your Quote - Book Free Inspection ($50 Refundable Deposit)
      </Link>
    </main>
  );
}
