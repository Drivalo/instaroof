/** Gold roof boundary stroke — outline only, never a fill wash. */
export const ROOF_OUTLINE_STROKE = "#C9A96E";
export const ROOF_OUTLINE_STROKE_WIDTH = 2;
export const ROOF_MAP_VIEWBOX_SIZE = 600;

type MapPoint = { x: number; y: number };

function parseMapPoint(value: unknown): MapPoint | null {
  if (!value || typeof value !== "object") return null;
  const x = Number((value as { x?: number }).x);
  const y = Number((value as { y?: number }).y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Closed polyline `points` for a stroke-only roof outline (no interior fill). */
export function roofOutlinePolylinePoints(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;

  const pts = raw.map(parseMapPoint).filter((p): p is MapPoint => p !== null);
  if (pts.length < 3) return null;

  const first = pts[0];
  const parts = pts.map((p) => `${p.x},${p.y}`);
  parts.push(`${first.x},${first.y}`);
  return parts.join(" ");
}
