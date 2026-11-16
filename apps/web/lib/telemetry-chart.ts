export interface HistoryPoint {
  timestamp: string;
  value: number;
  minimum?: number;
  maximum?: number;
  condition?: "good" | "warning" | "error";
}
export type History = Record<string, HistoryPoint[]>;
export interface ChartRow {
  timestamp: string;
  raw: Record<string, number>;
  [key: string]: string | number | Record<string, number>;
}
/** Align by timestamp without manufacturing zeros; constant series sit at 50. */
export function chartRows(history: History, normalize: boolean): ChartRow[] {
  const rows = new Map<string, ChartRow>();
  for (const [key, points] of Object.entries(history)) {
    const valid = points.filter((p) => Number.isFinite(p.value));
    const values = valid.map((p) => p.value);
    const min = Math.min(...values),
      max = Math.max(...values);
    for (const p of valid) {
      let row = rows.get(p.timestamp);
      if (!row) {
        row = { timestamp: p.timestamp, raw: {} };
        rows.set(p.timestamp, row);
      }
      row.raw[key] = p.value;
      row[key] = normalize
        ? max === min
          ? 50
          : ((p.value - min) / (max - min)) * 100
        : p.value;
    }
  }
  return [...rows.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}
