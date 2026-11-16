"use client";
import { useState } from "react";
import { api, assetPayload, type Asset, type Metrics } from "@/lib/operations";
import { Button } from "./button";
export function AssetControls({
  asset,
  metrics,
  onSaved,
}: {
  asset: Asset;
  metrics: Metrics;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(path: string, method: string, body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await onSaved();
      setMessage("Saved to database.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="asset-controls">
      <h3>Asset configuration</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save(`assets/${asset.id}`, "PATCH", {
            ...assetPayload(asset),
            name: f.get("name"),
            site: f.get("site"),
            firmware: f.get("firmware"),
            maintenance_due: f.get("due") || null,
            maintenance_status: f.get("status"),
            maintenance_note: f.get("note"),
          });
        }}
      >
        <label>
          Name
          <input
            name="name"
            defaultValue={asset.name}
            required
            maxLength={120}
          />
        </label>
        <label>
          Location
          <input
            name="site"
            defaultValue={asset.site}
            required
            maxLength={120}
          />
        </label>
        <label>
          Firmware
          <input name="firmware" defaultValue={asset.firmware} maxLength={60} />
        </label>
        <label>
          Maintenance due
          <input
            name="due"
            type="date"
            defaultValue={asset.maintenanceDue ?? ""}
          />
        </label>
        <label>
          Maintenance status
          <select name="status" defaultValue={asset.maintenanceStatus}>
            {["Not scheduled", "Scheduled", "In progress", "Completed"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Service notes
          <input
            name="note"
            maxLength={1000}
            defaultValue={asset.maintenanceNote}
          />
        </label>
        <Button disabled={busy} className="primary">
          Save configuration
        </Button>
      </form>
      <h3>Record a measurement</h3>
      <p className="muted">
        Operator-entered reading, saved with the current UTC timestamp.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save(`assets/${asset.id}/readings`, "POST", {
            device_id: asset.id,
            timestamp: new Date().toISOString(),
            metrics: { [String(f.get("metric"))]: Number(f.get("value")) },
            metadata: { source: "operator" },
          });
        }}
      >
        <label>
          Metric
          <select name="metric">
            {Object.entries(metrics).map(([key, m]) => (
              <option key={key} value={key}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          Value
          <input name="value" type="number" step="any" required />
        </label>
        <Button disabled={busy || !Object.keys(metrics).length}>
          Save reading
        </Button>
      </form>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
