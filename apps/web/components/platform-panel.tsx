"use client";
import { useEffect, useState } from "react";
import { api, type Asset, type Metrics } from "@/lib/operations";
import type { Role } from "./has-permission";
type Settings = {
  parent_id: string | null;
  latitude: number | null;
  longitude: number | null;
  sample_interval_seconds: number;
  offline_after_seconds: number;
  enabled_metrics: string[];
  alert_rules: Record<string, Record<string, number>>;
  anomaly_detection: boolean;
};
type Twin = {
  settings: Settings;
  provisioned: boolean;
  config_version: number;
  reported_config_version: number;
  reported_state: Record<string, unknown>;
  reported: Record<string, number>;
  desired: Record<string, unknown>;
  last_seen: string | null;
  kind: string;
};
export function PlatformPanel({
  asset,
  assets,
  metrics,
  role,
  onSaved,
}: {
  asset: Asset;
  assets: Asset[];
  metrics: Metrics;
  role: Role;
  onSaved: () => Promise<void>;
}) {
  const [twin, setTwin] = useState<Twin | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [credential, setCredential] = useState<{
      token: string;
      expires_at: string;
    } | null>(null);
  const write = role === "SuperAdmin" || role === "FleetOperator",
    maintain = write || role === "MaintenanceTech";
  async function load() {
    setTwin(await api<Twin>(`assets/${asset.id}/platform`));
  }
  useEffect(() => {
    const c = new AbortController();
    api<Twin>(`assets/${asset.id}/platform`, { signal: c.signal })
      .then(setTwin)
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [asset.id]);
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await load();
      await onSaved();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  if (!twin)
    return <p role="status">{message || "Loading device settings…"}</p>;
  return (
    <section className="platform-panel">
      <h3>Device health & digital twin</h3>
      <button
        className="button"
        disabled={busy}
        onClick={() => void save(async () => {})}
      >
        Refresh device state
      </button>
      <dl className="twin-status">
        <dt>Connectivity</dt>
        <dd>
          {asset.status} · last seen{" "}
          {twin.last_seen ? new Date(twin.last_seen).toLocaleString() : "never"}
        </dd>
        <dt>Configuration</dt>
        <dd>
          Desired v{twin.config_version} / applied v
          {twin.reported_config_version} ·{" "}
          {twin.config_version === twin.reported_config_version
            ? "In sync"
            : "Pending device acknowledgment"}
        </dd>
        <dt>Reported firmware</dt>
        <dd>{String(twin.reported_state.firmware ?? "Not reported")}</dd>
        <dt>Battery</dt>
        <dd>
          {twin.reported_state.battery_pct == null
            ? "Not reported"
            : String(twin.reported_state.battery_pct) + "%"}
        </dd>
        <dt>Signal strength</dt>
        <dd>
          {twin.reported_state.signal_dbm == null
            ? "Not reported"
            : String(twin.reported_state.signal_dbm) + " dBm"}
        </dd>
        <dt>Credential</dt>
        <dd>{twin.provisioned ? "Provisioned" : "Not provisioned"}</dd>
      </dl>
      <details>
        <summary>Inspect desired and reported state</summary>
        <pre>
          {JSON.stringify(
            {
              desired: twin.desired,
              reported: { metrics: twin.reported, ...twin.reported_state },
            },
            null,
            2,
          )}
        </pre>
      </details>
      {write && (
        <>
          <h3>Provisioning</h3>
          <p>
            Issue a 24-hour device credential. Rotation immediately invalidates
            the previous credential. Keep it on the device, never in a public
            client.
          </p>
          <div className="platform-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void save(async () => {
                  setCredential(
                    await api(`assets/${asset.id}/provision`, {
                      method: "POST",
                      body: JSON.stringify({ expires_in_hours: 24 }),
                    }),
                  );
                })
              }
            >
              {twin.provisioned ? "Rotate credential" : "Provision device"}
            </button>
            <button
              className="button"
              disabled={busy || !twin.provisioned}
              onClick={() =>
                void save(async () => {
                  await api(`assets/${asset.id}/revoke`, { method: "POST" });
                  setCredential(null);
                })
              }
            >
              Revoke credential
            </button>
          </div>
          {credential && (
            <div className="credential-result">
              <p>
                Copy now. This credential is not shown again. Expires{" "}
                {new Date(credential.expires_at).toLocaleString()}.
              </p>
              <textarea
                aria-label="Device credential"
                readOnly
                value={credential.token}
              />
              <button className="button" onClick={() => setCredential(null)}>
                Hide credential
              </button>
            </div>
          )}
        </>
      )}
      <h3>Hierarchy, location & sensors</h3>
      <form
        key={twin.config_version}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save(async () => {
            const rules: Record<string, Record<string, number>> = {};
            for (const key of Object.keys(metrics))
              for (const boundary of [
                "warning_low",
                "warning_high",
                "error_low",
                "error_high",
              ]) {
                const value = String(f.get(key + "." + boundary) ?? "");
                if (value.trim()) {
                  rules[key] ??= {};
                  rules[key][boundary] = Number(value);
                }
              }
            const body = {
              parent_id: f.get("parent") || null,
              latitude:
                f.get("latitude") === "" ? null : Number(f.get("latitude")),
              longitude:
                f.get("longitude") === "" ? null : Number(f.get("longitude")),
              sample_interval_seconds: Number(f.get("sample")),
              offline_after_seconds: Number(f.get("offline")),
              enabled_metrics: f.getAll("enabled"),
              alert_rules: rules,
              anomaly_detection: f.get("anomaly") === "on",
            };
            await api(`assets/${asset.id}/platform`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
          });
        }}
      >
        <fieldset disabled={!write || busy}>
          <label>
            Parent asset
            <select name="parent" defaultValue={twin.settings.parent_id ?? ""}>
              <option value="">Top level</option>
              {assets
                .filter((a) => a.id !== asset.id)
                .map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name} · {a.kind ?? "machine"}
                  </option>
                ))}
            </select>
          </label>
          <div className="platform-columns">
            <label>
              Latitude
              <input
                name="latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                defaultValue={twin.settings.latitude ?? ""}
              />
            </label>
            <label>
              Longitude
              <input
                name="longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                defaultValue={twin.settings.longitude ?? ""}
              />
            </label>
          </div>
          <div className="platform-columns">
            <label>
              Sample interval (seconds)
              <input
                name="sample"
                type="number"
                min="1"
                max="3600"
                required
                defaultValue={twin.settings.sample_interval_seconds}
              />
            </label>
            <label>
              Offline after (seconds)
              <input
                name="offline"
                type="number"
                min="10"
                max="86400"
                required
                defaultValue={twin.settings.offline_after_seconds}
              />
            </label>
          </div>
          <p>
            Devices fetch these settings from /device/config and acknowledge the
            version via /device/state.
          </p>
          <div className="sensor-checkboxes">
            {Object.entries(metrics).map(([key, m]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  name="enabled"
                  value={key}
                  defaultChecked={twin.settings.enabled_metrics.includes(key)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="anomaly"
              defaultChecked={twin.settings.anomaly_detection}
            />
            Rolling anomaly detection
          </label>
          <h3>Alert rules</h3>
          <p>
            Set per-device limits. Leave a boundary blank to use its default.
            Critical limits must be outside warning limits.
          </p>
          <div className="rule-grid">
            {Object.entries(metrics).map(([key, m]) => (
              <fieldset key={key}>
                <legend>
                  {m.label} ({m.unit})
                </legend>
                <div className="platform-columns">
                  {(
                    [
                      "warning_low",
                      "warning_high",
                      "error_low",
                      "error_high",
                    ] as const
                  ).map((boundary) => (
                    <label key={boundary}>
                      {boundary.replace("error", "critical").replace("_", " ")}
                      <input
                        name={key + "." + boundary}
                        type="number"
                        step="any"
                        min={m.min}
                        max={m.max}
                        placeholder={String(m.limits?.[boundary] ?? "No limit")}
                        defaultValue={
                          twin.settings.alert_rules[key]?.[boundary] ?? ""
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {write && (
            <button className="button primary" disabled={busy}>
              Save device settings
            </button>
          )}
        </fieldset>
      </form>
      {maintain && (
        <>
          <h3>Maintenance schedule</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(() =>
                api(`assets/${asset.id}/maintenance`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    maintenance_due: f.get("due") || null,
                    maintenance_status: f.get("status"),
                    maintenance_note: f.get("note"),
                  }),
                }),
              );
            }}
          >
            <label>
              Due date
              <input
                name="due"
                type="date"
                defaultValue={asset.maintenanceDue ?? ""}
              />
            </label>
            <label>
              Status
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
              <textarea
                name="note"
                maxLength={1000}
                defaultValue={asset.maintenanceNote}
              />
            </label>
            <button disabled={busy} className="button">
              Save maintenance
            </button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function AuditPanel({ hours }: { hours: number }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [cursor, setCursor] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    setRows([]);
    setBusy(true);
    setError("");
    api<{ items: Record<string, unknown>[]; next_cursor: number | null }>(
      `audit?hours=${hours}`,
      { signal: c.signal },
    )
      .then((d) => {
        setRows(d.items);
        setCursor(d.next_cursor);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [hours]);
  return (
    <section className="panel audit-panel">
      <div className="panel-heading">
        <h2>Append-only audit log</h2>
        <p>Tenant-scoped database changes · last {hours} hours</p>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows.length && (
        <p className="empty-state">
          {busy ? "Loading…" : "No changes in this period."}
        </p>
      )}
      {rows.map((row) => (
        <details key={String(row.id)}>
          <summary>
            {String(row.created_at)} · {String(row.actor)} ·{" "}
            {String(row.action)} {String(row.entity)}
          </summary>
          <pre>{JSON.stringify(row, null, 2)}</pre>
        </details>
      ))}
      {cursor && (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const d = await api<{
                items: Record<string, unknown>[];
                next_cursor: number | null;
              }>(`audit?hours=${hours}&before=${cursor}`);
              setRows((r) => [...r, ...d.items]);
              setCursor(d.next_cursor);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Older entries
        </button>
      )}
    </section>
  );
}
export function HierarchyPanel({
  assets,
  onInspect,
}: {
  assets: Asset[];
  onInspect: (a: Asset) => void;
}) {
  const ids = new Set(assets.map((a) => a.id));
  function tree(parent: string | null, seen: Set<string>): React.ReactNode {
    return (
      <ul>
        {assets
          .filter((a) =>
            parent
              ? a.parentId === parent
              : !a.parentId || !ids.has(a.parentId),
          )
          .map((a) => (
            <li key={a.id}>
              <button onClick={() => onInspect(a)}>
                <span>{a.kind ?? "machine"}</span>
                <strong>{a.name}</strong>
                <small>{a.status}</small>
              </button>
              {!seen.has(a.id) && tree(a.id, new Set([...seen, a.id]))}
            </li>
          ))}
      </ul>
    );
  }
  return (
    <section className="panel hierarchy-panel">
      <div className="panel-heading">
        <h2>Asset hierarchy</h2>
        <p>
          Open an asset to change its parent. Inventory reflects current
          configuration.
        </p>
      </div>
      {tree(null, new Set())}
    </section>
  );
}
