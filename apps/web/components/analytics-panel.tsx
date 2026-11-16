"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { api, type Asset, type Metrics } from "@/lib/operations";
type Analysis = {
  summary: {
    samples: number;
    devices: number;
    minimum: number | null;
    maximum: number | null;
    mean: number | null;
    deviation: number | null;
    p95: number | null;
  };
  histogram: { lower: number; upper: number; count: number }[];
  sites: { site: string; mean: number; maximum: number; samples: number }[];
  trend: {
    timestamp: string;
    mean: number;
    minimum: number;
    maximum: number;
    samples: number;
  }[];
};
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  fontSize: 11,
};
const tick = { fill: "var(--muted)", fontSize: 10 };
const format = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
function ChartCard({
  title,
  description,
  children,
  empty = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="panel analytics-chart">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {empty ? (
        <p className="empty-state">No recorded data in this period.</p>
      ) : (
        <div className="analytics-canvas">{children}</div>
      )}
    </section>
  );
}
export function AnalyticsPanel({
  metrics,
  assets,
  range,
  revision,
  totalAssets,
}: {
  metrics: Metrics;
  assets: Asset[];
  range: string;
  revision: string;
  totalAssets: number;
}) {
  const [metric, setMetric] = useState("temperature");
  const [result, setResult] = useState<{ key: string; data: Analysis } | null>(
    null,
  );
  const [error, setError] = useState("");
  const hours = range === "24 hours" ? 24 : range === "7 days" ? 168 : 720;
  const key = metric + ":" + hours;
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Analysis>(
      `analytics?metric=${encodeURIComponent(metric)}&hours=${hours}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [metric, hours, key, revision]);
  const data = result?.key === key ? result.data : null;
  const unit = metrics[metric]?.unit ?? "";
  const health = [
    { name: "Healthy", color: "var(--green)" },
    { name: "Warning", color: "var(--orange)" },
    { name: "Critical", color: "var(--red)" },
    { name: "Offline", color: "var(--muted)" },
  ]
    .map((s) => ({
      ...s,
      value: assets.filter((a) => a.status === s.name).length,
    }))
    .filter((s) => s.value);
  const bins =
    data?.histogram.map((b, i) => ({
      ...b,
      range: `${format(b.lower)}–${format(b.upper)}`,
      label: String(i + 1),
    })) ?? [];
  return (
    <div className="analytics-view">
      <div className="analytics-controls">
        <div>
          <h2>Signal analysis</h2>
          <p>Measured values · {range} · UTC · all tenant readings</p>
        </div>
        <label>
          Analyze metric
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            {Object.entries(metrics).map(([k, m]) => (
              <option value={k} key={k}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p className="empty-state" role="status">
          {error
            ? "Analysis unavailable. Change the metric or retry after the next refresh."
            : "Loading analysis…"}
        </p>
      ) : (
        <>
          <section className="stats-grid" aria-label="Analytics counters">
            {[
              [
                "Measurements",
                format(data.summary.samples),
                "Recorded metric values",
              ],
              [
                "Reporting devices",
                format(data.summary.devices),
                "Distinct devices in period",
              ],
              [
                "95th percentile",
                format(data.summary.p95) + " " + unit,
                "95% of readings at or below",
              ],
              [
                "Standard deviation",
                format(data.summary.deviation) + " " + unit,
                "Population variability",
              ],
            ].map(([label, value, note]) => (
              <article className="stat-card" key={label}>
                <div className="stat-label">{label}</div>
                <div className="stat-value">{value}</div>
                <p>{note}</p>
              </article>
            ))}
          </section>
          <div className="analytics-grid">
            <ChartCard
              title="Signal trend"
              description={`Mean, minimum and maximum · ${unit} · up to 120 time buckets`}
              empty={!data.trend.length}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.trend}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tick={tick}
                    minTickGap={45}
                    tickFormatter={(v) =>
                      new Date(v)
                        .toISOString()
                        .slice(hours > 24 ? 5 : 11, 16)
                        .replace("T", " ")
                    }
                  />
                  <YAxis width={52} tick={tick} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(v) =>
                      new Date(String(v))
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 16) + " UTC"
                    }
                    formatter={(v) => format(Number(v)) + " " + unit}
                  />
                  <Legend />
                  <Line
                    name="Mean"
                    dataKey="mean"
                    stroke="var(--accent)"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    name="Maximum"
                    dataKey="maximum"
                    stroke="var(--orange)"
                    strokeDasharray="5 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="Minimum"
                    dataKey="minimum"
                    stroke="var(--green)"
                    strokeDasharray="2 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Reading distribution"
              description={`Frequency of raw readings · ${unit} · equal-width bins; last bin includes maximum`}
              empty={!bins.length}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bins}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  barCategoryGap={2}
                >
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={tick}
                    label={{
                      value: "Bin number",
                      position: "insideBottom",
                      offset: -2,
                      fill: "var(--muted)",
                      fontSize: 10,
                    }}
                    height={42}
                  />
                  <YAxis tick={tick} allowDecimals={false} width={45} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload.range + " " + unit
                    }
                  />
                  <Bar
                    dataKey="count"
                    name="Readings"
                    fill="var(--accent)"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Site comparison"
              description={`Top 10 sites by mean ${metrics[metric]?.label.toLowerCase() ?? metric} · ${unit}; higher is not necessarily better`}
              empty={!data.sites.length}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.sites}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--line)" horizontal={false} />
                  <XAxis type="number" tick={tick} />
                  <YAxis
                    type="category"
                    dataKey="site"
                    width={100}
                    tick={tick}
                    tickFormatter={(v) =>
                      String(v).length > 14 ? String(v).slice(0, 13) + "…" : v
                    }
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => format(Number(v)) + " " + unit}
                  />
                  <Bar
                    dataKey="mean"
                    name="Mean"
                    fill="var(--chart-2)"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard
              title="Fleet health mix"
              description={`Current status · ${assets.length} displayed assets of ${totalAssets}; independent of historical metric selection`}
              empty={!health.length}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={health}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="45%"
                    outerRadius="70%"
                    stroke="var(--surface)"
                    isAnimationActive={false}
                  >
                    {health.map((h) => (
                      <Cell key={h.name} fill={h.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    formatter={(value) =>
                      `${value} (${health.find((h) => h.name === value)?.value ?? 0})`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <section className="panel analytics-table">
            <div className="panel-heading">
              <h2>Distribution & site detail</h2>
              <p>
                Mean {format(data.summary.mean)} {unit} · minimum{" "}
                {format(data.summary.minimum)} · maximum{" "}
                {format(data.summary.maximum)}
              </p>
            </div>
            <details>
              <summary>Reading distribution values</summary>
              <div
                className="table-scroll"
                tabIndex={0}
                aria-label="Histogram data"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Bin ({unit})</th>
                      <th>Readings</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bins.map((b, i) => (
                      <tr key={i}>
                        <td>{b.range}</td>
                        <td>{b.count}</td>
                        <td>
                          {format((b.count / data.summary.samples) * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <details>
              <summary>Site comparison values</summary>
              <div
                className="table-scroll"
                tabIndex={0}
                aria-label="Site comparison data"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Mean ({unit})</th>
                      <th>Maximum ({unit})</th>
                      <th>Readings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sites.map((s) => (
                      <tr key={s.site}>
                        <td>{s.site}</td>
                        <td>{format(s.mean)}</td>
                        <td>{format(s.maximum)}</td>
                        <td>{s.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
