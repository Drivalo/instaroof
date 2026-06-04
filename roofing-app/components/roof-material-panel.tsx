"use client";

import {
  calcStandardRangeForMaterial,
  comparisonMaterialsForLead,
  getMaterialOptionsForLead,
  roofMaterialLabel,
  type RoofMaterialOption,
} from "@/lib/roof-material";
import { SettingsRow } from "@/lib/types";

const slotButtonBase =
  "text-left w-full rounded-lg border border-border-subtle bg-background px-4 py-3 text-foreground transition-colors hover:border-accent";
const slotButtonSelected = "border-accent bg-[#F5A623] text-[#1C1C1C] hover:border-accent";

type FormatRange = (low: number, high: number) => string;

export function RoofMaterialSelector({
  countryCode,
  address,
  selectedId,
  disabled,
  onSelect,
}: {
  countryCode: string | null;
  address: string;
  selectedId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const options = getMaterialOptionsForLead(countryCode, address);

  return (
    <div className="space-y-2" role="radiogroup" aria-labelledby="roof-material-label">
      {options.map((opt) => (
        <MaterialOptionButton
          key={opt.id}
          option={opt}
          selected={selectedId === opt.id}
          disabled={disabled}
          onSelect={() => onSelect(opt.id)}
        />
      ))}
    </div>
  );
}

function MaterialOptionButton({
  option,
  selected,
  disabled,
  onSelect,
}: {
  option: RoofMaterialOption;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`${selected ? slotButtonSelected : slotButtonBase} flex items-center gap-3 disabled:opacity-50`}
    >
      <span className="text-xl shrink-0 w-8 text-center" aria-hidden>
        {option.icon}
      </span>
      <span className="text-sm leading-snug">{option.label}</span>
    </button>
  );
}

export function RoofMaterialComparisonTable({
  countryCode,
  address,
  roofSqft,
  settings,
  formatRange,
  blurred,
}: {
  countryCode: string | null;
  address: string;
  roofSqft: number;
  settings: SettingsRow;
  formatRange: FormatRange;
  blurred?: boolean;
}) {
  const materials = comparisonMaterialsForLead(countryCode, address);

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-background/50 overflow-hidden ${
        blurred ? "blur-[12px] select-none" : ""
      }`}
    >
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-border-subtle text-muted">
            <th className="px-3 py-2 font-normal">Material</th>
            <th className="px-3 py-2 font-normal text-right">Est. replacement range</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((opt) => {
            const { low, high } = calcStandardRangeForMaterial(roofSqft, opt.id, settings);
            return (
              <tr key={opt.id} className="border-b border-border-subtle last:border-b-0">
                <td className="px-3 py-2.5 text-foreground">
                  <span className="mr-2" aria-hidden>
                    {opt.icon}
                  </span>
                  {opt.label}
                </td>
                <td className="px-3 py-2.5 text-foreground text-right whitespace-nowrap">
                  {formatRange(low, high)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RoofMaterialSingleEstimate({
  materialId,
  countryCode,
  address,
  low,
  high,
  formatRange,
  blurred,
}: {
  materialId: string;
  countryCode: string | null;
  address: string;
  low: number;
  high: number;
  formatRange: FormatRange;
  blurred?: boolean;
}) {
  const label = roofMaterialLabel(materialId, countryCode, address);
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4 text-foreground max-w-md">
      <h3 className="text-sm text-muted">Full replacement estimate</h3>
      <p className="mt-1 text-sm text-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl text-foreground ${blurred ? "blur-[16px] select-none" : ""}`}
        aria-hidden={blurred}
      >
        {formatRange(low, high)}
      </p>
    </div>
  );
}
