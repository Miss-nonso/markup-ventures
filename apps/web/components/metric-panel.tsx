"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  condition,
  conditionLabel,
  worst,
  limitLabel,
} from "@/lib/metric-condition";
import { api, type Metrics } from "@/lib/operations";
import {
  chartRows,
  type History,
  type HistoryPoint,
  type ChartRow,
} from "@/lib/telemetry-chart";
export function MetricPanel({
  metrics,
  range,
  revision,
}: {
  metrics: Metrics;
  range: string;
  revision: string;
}) {
  const [metric, setMetric] = useState("all");
  const [result, setResult] = useState<{ key: string; history: History }>({
    key: "",
    history: {},
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const keys = useMemo(
    () => (metric === "all" ? Object.keys(metrics) : [metric]),
    [metric, metrics],
  );
  const requestKey = keys.join(",") + range;
  const history = result.key === requestKey ? result.history : {};
  const hours = range === "24 hours" ? 24 : range === "7 days" ? 168 : 720;
  useEffect(() => {
    if (!keys.length) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all(
      keys.map(
        async (key) =>
          [
            key,
            await api<HistoryPoint[]>(
              `telemetry/history?metric=${encodeURIComponent(key)}&hours=${hours}`,
              { signal: controller.signal },
            ),
          ] as const,
      ),
    )
      .then((entries) => {
        if (!controller.signal.aborted)
          setResult({ key: requestKey, history: Object.fromEntries(entries) });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [keys, hours, revision, requestKey]);
  const all = metric === "all";
  const data = useMemo(() => chartRows(history, all), [history, all]);
  const state = (key: string) =>
    worst(
      (history[key] ?? []).map(
        (p) => p.condition ?? condition(p.value, metrics[key]?.limits),
      ),
    );
  const color = (key: string) =>
    `var(--${{ good: "green", warning: "orange", error: "red", unknown: "muted" }[state(key)]})`;
  return (
    <section className="panel telemetry">
      <div className="panel-heading">
        <div>
          <h2>Fleet telemetry</h2>
          <p>
            {all
              ? "All metrics · relative trends (0–100)"
              : "Mean readings · " + (metrics[metric]?.unit ?? "")}{" "}
            · UTC
          </p>
        </div>
        <select
          aria-label="Chart metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="all">All metrics</option>
          {Object.entries(metrics).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label} ({m.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="telemetry-legend" aria-label="Metric legend">
        {keys.map((key) => (
          <span key={key} title={limitLabel(metrics[key]?.limits)}>
            <i style={{ background: color(key) }} />
            {metrics[key]?.label ?? key} · {conditionLabel(state(key))}
          </span>
        ))}
      </div>
      <div className="chart" style={{ height: 265 }}>
        {error ? (
          <p role="alert">{error}</p>
        ) : loading && !data.length ? (
          <div className="empty-state">Loading telemetry…</div>
        ) : !data.length ? (
          <div className="empty-state">
            No recorded readings in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 15, right: 15, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--line)"
                strokeDasharray="3 4"
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(v) =>
                  new Date(v)
                    .toISOString()
                    .slice(hours > 24 ? 5 : 11, 16)
                    .replace("T", " ")
                }
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                minTickGap={45}
              />
              <YAxis
                domain={all ? [0, 100] : ["auto", "auto"]}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as ChartRow;
                  return (
                    <div className="telemetry-tooltip">
                      <strong>
                        {new Date(String(label))
                          .toISOString()
                          .replace("T", " ")
                          .slice(0, 16)}{" "}
                        UTC
                      </strong>
                      {keys
                        .filter((key) => row.raw[key] !== undefined)
                        .map((key) => (
                          <div key={key}>
                            <i style={{ background: color(key) }} />
                            <span>
                              {metrics[key]?.label} ·{" "}
                              {conditionLabel(history[key]?.find(
                                (p) => p.timestamp === row.timestamp,
                              )?.condition ??
                                condition(row.raw[key], metrics[key]?.limits))}
                            </span>
                            <b>
                              {row.raw[key].toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}{" "}
                              {metrics[key]?.unit}
                              <small>
                                {" "}
                                min{" "}
                                {history[key]
                                  ?.find((p) => p.timestamp === row.timestamp)
                                  ?.minimum?.toFixed(1)}{" "}
                                / max{" "}
                                {history[key]
                                  ?.find((p) => p.timestamp === row.timestamp)
                                  ?.maximum?.toFixed(1)}
                              </small>
                            </b>
                          </div>
                        ))}
                    </div>
                  );
                }}
              />
              {keys.map((key, index) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={metrics[key]?.label ?? key}
                  stroke={color(key)}
                  strokeWidth={state(key) === "error" ? 2.6 : 1.8}
                  strokeDasharray={
                    all
                      ? [undefined, "6 3", "2 3", "10 3 2 3"][index % 4]
                      : undefined
                  }
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="panel-footer">
        <span>
          Stored readings · {range} · line color = worst reading in period
        </span>
        <span>
          {all
            ? "Each series scaled to its observed range; constant = 50"
            : "Original engineering units"}
        </span>
      </div>
    </section>
  );
}
