import type { Limits, Condition } from "./metric-condition";
export type Status = "Healthy" | "Warning" | "Critical" | "Offline";
export interface Asset {
  id: string;
  parentId?: string | null;
  kind?: string;
  deviceSettings?: {
    latitude?: number | null;
    longitude?: number | null;
    offline_after_seconds?: number;
    alert_rules?: Record<string, Limits>;
  };
  name: string;
  type: string;
  site: string;
  status: Status;
  temperature: number | null;
  vibration: number | null;
  uptime: string;
  firmware: string;
  metrics: Record<string, number>;
  lastSeen: string | null;
  source: string;
  maintenanceDue: string | null;
  maintenanceStatus: string;
  maintenanceNote: string;
}
export interface Alert {
  id: string;
  title: string;
  asset: string;
  deviceId: string;
  site: string;
  severity: string;
  status?: string;
  time: string;
  metric: string;
  value: number;
}
export interface Snapshot {
  hours?: number;
  summary?: Record<
    string,
    {
      value: number;
      minimum: number;
      maximum: number;
      samples: number;
      condition: Condition;
    }
  >;
  liveErrors?: string[];
  maintenanceHistory?: {
    time: string;
    deviceId: string;
    asset: string;
    maintenance_status: string;
    maintenance_note: string;
    maintenance_due: string | null;
  }[];
  assets: Asset[];
  alerts: Alert[];
  readings24h: number;
  totalAssets: number;
  totalAlerts: number;
  limit: number;
  updatedAt: string;
}
export type Metrics = Record<
  string,
  {
    label: string;
    unit: string;
    min: number;
    max: number;
    threshold?: number;
    limits?: Limits;
  }
>;
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Session expired. Please sign in.");
  }
  if (!response.ok) {
    let message = "Request failed. Please try again.";
    try {
      const error = await response.json();
      if (typeof error.detail === "string") message = error.detail;
      else if (Array.isArray(error.detail))
        message = error.detail.map((e: { msg: string }) => e.msg).join("; ");
    } catch {}
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function assetPayload(a: Asset) {
  return {
    name: a.name,
    site: a.site,
    equipment_type: a.type,
    firmware: a.firmware,
    maintenance_due: a.maintenanceDue,
    maintenance_status: a.maintenanceStatus,
    maintenance_note: a.maintenanceNote,
  };
}
