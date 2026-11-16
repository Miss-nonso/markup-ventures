export type Status = "Healthy" | "Warning" | "Critical" | "Offline";
export interface Asset {
  id: string;
  name: string;
  type: string;
  site: string;
  status: Status;
  temperature: number;
  vibration: number;
  uptime: string;
  firmware: string;
}
export const assets: Asset[] = [
  {
    id: "MV-PMP-001",
    name: "Hydraulic Pump A1",
    type: "Pump",
    site: "Houston Plant",
    status: "Healthy",
    temperature: 64.2,
    vibration: 2.4,
    uptime: "99.98%",
    firmware: "v2.8.1",
  },
  {
    id: "MV-CMP-012",
    name: "Air Compressor B2",
    type: "Compressor",
    site: "Berlin Facility",
    status: "Warning",
    temperature: 78.6,
    vibration: 7.8,
    uptime: "98.42%",
    firmware: "v2.8.0",
  },
  {
    id: "MV-TRB-008",
    name: "Wind Turbine T8",
    type: "Turbine",
    site: "Rotterdam Hub",
    status: "Healthy",
    temperature: 52.1,
    vibration: 1.8,
    uptime: "99.99%",
    firmware: "v2.8.1",
  },
  {
    id: "MV-MTR-023",
    name: "Conveyor Motor C3",
    type: "Motor",
    site: "Singapore Plant",
    status: "Critical",
    temperature: 92.4,
    vibration: 9.2,
    uptime: "96.81%",
    firmware: "v2.7.4",
  },
  {
    id: "MV-GEN-006",
    name: "Backup Generator G6",
    type: "Generator",
    site: "Houston Plant",
    status: "Offline",
    temperature: 24.8,
    vibration: 0,
    uptime: "97.20%",
    firmware: "v2.8.1",
  },
];
export const initialAlerts = [
  {
    id: "AL-1042",
    title: "High vibration detected",
    asset: "Conveyor Motor C3",
    site: "Singapore Plant",
    severity: "Critical",
    time: "2 min ago",
  },
  {
    id: "AL-1041",
    title: "Temperature above threshold",
    asset: "Air Compressor B2",
    site: "Berlin Facility",
    severity: "Warning",
    time: "8 min ago",
  },
  {
    id: "AL-1040",
    title: "Device connection lost",
    asset: "Backup Generator G6",
    site: "Houston Plant",
    severity: "Offline",
    time: "14 min ago",
  },
];
export function series(seed = 0) {
  return Array.from({ length: 49 }, (_, i) => ({
    time: `${String(8 + Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}`,
    temperature:
      58 +
      Math.sin(i * 0.45 + seed) * 5 +
      Math.sin(i * 1.7) * 2 +
      (i > 27 && i < 32 ? 10 : 0),
    pressure: 39 + Math.sin(i * 0.35 + 1 + seed) * 5 + Math.sin(i * 1.9) * 2,
    vibration: 22 + Math.sin(i * 0.5 + 2 + seed) * 3 + Math.cos(i * 1.3) * 1.5,
  }));
}
