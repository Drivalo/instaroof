"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="quote-pdf-print-btn no-print"
    >
      Print / Save as PDF
    </button>
  );
}
