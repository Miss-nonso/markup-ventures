"use client";
import { useState, useEffect } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Boxes,
  Building2,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Command,
  Download,
  Ellipsis,
  Factory,
  Globe2,
  LayoutDashboard,
  Maximize2,
  Menu,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Asset } from "@/lib/operations";
import { useOperations } from "@/hooks/use-operations";
import { AnalyticsPanel } from "./analytics-panel";
import { MetricPanel } from "./metric-panel";
import { AssetControls } from "./asset-controls";
import { HasPermission } from "./has-permission";
import { FleetMap } from "./fleet-map";
import { Button } from "./button";
import { PlatformPanel, AuditPanel, HierarchyPanel } from "./platform-panel";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { AlarmToggle } from "./alarm-toggle";
import { condition, conditionLabel, limitLabel } from "@/lib/metric-condition";
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Fleet map", icon: Globe2 },
  { name: "Digital twins", icon: Boxes },
  { name: "Alert center", icon: Bell },
  { name: "Analytics", icon: ChartNoAxesCombined },
  { name: "Maintenance", icon: Wrench },
  { name: "Asset hierarchy", icon: Building2 },
  { name: "Audit logs", icon: ShieldCheck },
];
export function Dashboard({
  user,
}: {
  user: { email: string; role: import("./has-permission").Role };
}) {
  const canWrite = user.role === "SuperAdmin" || user.role === "FleetOperator";
  const canAck = user.role !== "Auditor";
  const canAudit = user.role !== "MaintenanceTech";
  const [nav, setNav] = useState("Overview");
  useEffect(() => {
    async function check() {
      try {
        const response = await fetch("/api/backend/auth/me", {
          cache: "no-store",
        });
        if (response.status === 401) window.location.replace("/login");
      } catch {}
    }
    const timer = setInterval(check, 30000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);
  async function logout() {
    try {
      const response = await fetch("/api/backend/auth/logout", {
        method: "POST",
      });
      if (response.ok) window.location.replace("/login");
      else setToast("Sign out failed. Please retry.");
    } catch {
      setToast("Unable to reach the server. Please retry sign out.");
    }
  }
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setCollapsed(false);
  }, [nav]);
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const range = ranges[nav] ?? "24 hours";
  const setRange = (value: string) =>
    setRanges((previous) => ({ ...previous, [nav]: value }));
  const hours = range === "24 hours" ? 24 : range === "7 days" ? 168 : 720;
  const [paused, setPaused] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [asset, setAsset] = useState<Asset | null>(null);

  const [filter, setFilter] = useState("All statuses");
  const [site, setSite] = useState("All sites");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"asset" | "report" | "settings" | null>(
    null,
  );

  const [expanded, setExpanded] = useState(true);
  const operations = useOperations(paused, hours, nav === "Alert center");
  const {
    assets: allAssets,
    alerts,
    metrics,
    error,
    loading,
    refresh,
    demoEnabled,
  } = operations;
  const assets =
    nav === "Fleet map" || nav === "Digital twins"
      ? allAssets.filter((a) => Object.keys(a.metrics).length > 0)
      : allAssets;
  useEffect(() => {
    if (!loading && !error)
      setAsset((current) =>
        current
          ? (allAssets.find((a) => a.id === current.id) ?? current)
          : null,
      );
  }, [allAssets, loading, error]);
  const connected = !error && !loading;
  const [saving, setSaving] = useState(false);
  const sites = [...new Set(allAssets.map((a) => a.site))];
  const online = allAssets.filter((a) => a.status !== "Offline").length;
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    success: string,
  ) {
    setSaving(true);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await refresh();
      setToast(success);
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function acknowledgeAll() {
    setSaving(true);
    try {
      for (const a of alerts.filter((a) => a.status === "open"))
        await api(`alerts/${a.id}/acknowledge`, {
          method: "POST",
          body: JSON.stringify({ note: "Acknowledged from command center" }),
        });
      setToast("Alerts acknowledged");
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "Some alerts could not be acknowledged",
      );
    } finally {
      await refresh();
      setSaving(false);
    }
  }
  const filtered = assets.filter(
    (a) =>
      (filter === "All statuses" || a.status === filter) &&
      (site === "All sites" || a.site === site) &&
      `${a.name} ${a.id} ${a.site}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setModal(null);
        setAsset(null);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  function exportData() {
    const metricKeys = Object.keys(metrics);
    const escape = (value: unknown) => {
      let v = String(value ?? "");
      if (/^[=+@-]/.test(v)) v = "'" + v;
      return '"' + v.replaceAll('"', '""') + '"';
    };
    const csv = [
      [
        "Asset ID",
        "Name",
        "Site",
        "Status",
        ...metricKeys.map((k) => `${metrics[k].label} (${metrics[k].unit})`),
      ],
      ...filtered.map((a) => [
        a.id,
        a.name,
        a.site,
        a.status,
        ...metricKeys.map((k) => a.metrics[k] ?? ""),
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "markup-fleet-report.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("Fleet report exported");
  }
  const isOverview = nav === "Overview";
  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <Brand />
        <button className="workspace" onClick={() => setModal("settings")}>
          <span className="workspace-icon">
            <Building2 size={17} />
          </span>
          <span>
            Markup Ventures<small>Operations workspace</small>
          </span>
          <ChevronsUpDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation
            .filter((n) => n.name !== "Audit logs" || canAudit)
            .map(({ name, icon: Icon }) => (
              <button
                className={nav === name ? "active" : ""}
                key={name}
                onClick={() => {
                  setNav(name);
                  setSearch("");
                  setSite("All sites");
                }}
              >
                <Icon size={18} />
                <span>{name}</span>
                {name === "Alert center" && <b>{alerts.length}</b>}
                {name === "Overview" && <i className="nav-active-dot" />}
              </button>
            ))}
        </nav>
        <div className="nav-label enterprise-label">
          ENTERPRISE{" "}
          <button
            aria-label="Add asset"
            onClick={() => canWrite && setModal("asset")}
          >
            <Plus size={14} />
          </button>
        </div>
        <button className="tree-parent" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Building2 size={15} />
          <span>All locations</span>
          <small>{sites.length}</small>
        </button>
        {expanded && (
          <div className="tree-sites">
            {sites.map((s, i) => (
              <button
                key={s}
                className={site === s ? "selected" : ""}
                onClick={() => {
                  setSite(s);
                  setNav("Digital twins");
                }}
              >
                <span className="dot healthy" />
                {s}
              </button>
            ))}
            <button onClick={() => setNav("Fleet map")}>
              View all locations <ArrowRight size={12} />
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="dot healthy" />
            <span>
              {error
                ? "Connection unavailable"
                : loading
                  ? "Connecting…"
                  : "Database connected"}
            </span>
            <ArrowUpRight size={12} />
          </div>
          <button onClick={() => setModal("settings")}>
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setToast("Support: operations@markupventures.com")}
          >
            <CircleHelp size={17} />
            <span>Help & documentation</span>
            <ArrowUpRight size={13} />
          </button>
          <button onClick={logout}>
            <ShieldCheck size={17} />
            <span>Sign out</span>
          </button>
          <div className="profile">
            <span className="avatar">JD</span>
            <span>
              {user.email}
              <small>{user.role}</small>
            </span>
            <button
              aria-label="Operator settings"
              onClick={() => setModal("settings")}
            >
              <ChevronsUpDown size={14} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Menu size={17} />
            </button>
            <span className="divider" />
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{nav}</strong>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <AlarmToggle
              breaches={operations.liveErrors ?? []}
              paused={paused || loading || !!error}
            />
            <button
              className="search-trigger"
              aria-label="Find assets"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
              <span>Find asset...</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="top-divider" />
            <button
              className="notification"
              aria-label="Open alerts"
              onClick={() => setNav("Alert center")}
            >
              <Bell size={18} />
              {alerts.length > 0 && <i />}
            </button>
            <span className="avatar small">JD</span>
          </div>
        </header>
        <main>
          {(error || loading) && (
            <div className="data-notice" role="status">
              {error || "Loading saved operations…"}{" "}
              {error && <Button onClick={() => void refresh()}>Retry</Button>}
            </div>
          )}
          {demoEnabled && (
            <div className="data-notice">
              Local demo account · Sample readings are labeled and stored in the
              database.{" "}
              <Button
                disabled={saving}
                onClick={() =>
                  void mutate(
                    "demo/seed",
                    "POST",
                    {},
                    "Sample fleet loaded. Existing assets were preserved.",
                  )
                }
              >
                Load sample fleet
              </Button>
            </div>
          )}
          {operations.totalAssets > operations.limit && (
            <div className="data-notice">
              Showing the first {operations.limit} assets of{" "}
              {operations.totalAssets}. Metric summaries below cover these
              displayed assets.
            </div>
          )}

          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="dot healthy" /> MV / OPERATIONS
              </div>
              <h1>
                {isOverview
                  ? "Operations console"
                  : nav === "Fleet map"
                    ? "Global fleet"
                    : nav === "Digital twins"
                      ? "Digital twins"
                      : nav === "Alert center"
                        ? "Alert center"
                        : nav === "Analytics"
                          ? "Operational analytics"
                          : nav}
              </h1>
              <p>
                {isOverview
                  ? "Fleet status, telemetry and exceptions."
                  : nav === "Fleet map"
                    ? "Site distribution and reporting assets."
                    : nav === "Digital twins"
                      ? "Asset configuration and last recorded readings."
                      : nav === "Alert center"
                        ? "Review exceptions. Record acknowledgments."
                        : nav === "Analytics"
                          ? "Compare recorded signals across the selected period."
                          : nav === "Asset hierarchy"
                            ? "Enterprise, site and device relationships."
                            : nav === "Audit logs"
                              ? "Recorded changes, actors and timestamps."
                              : "Service schedules and recorded maintenance changes."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="live-pill"
                onClick={() => setPaused(!paused)}
                title="Pause or resume database refresh"
              >
                <Radio size={12} />
                {paused
                  ? "Paused"
                  : operations.streaming
                    ? "Live stream"
                    : connected
                      ? "Polling fallback"
                      : "Reconnecting"}
              </button>
              <Button onClick={() => setModal("report")}>
                <Download size={14} />
                Export report
              </Button>
              <HasPermission role={user.role} permission="write">
                <Button
                  className="primary"
                  onClick={() => canWrite && setModal("asset")}
                >
                  <Plus size={16} />
                  Add asset
                </Button>
              </HasPermission>
            </div>
          </div>
          <div className="overview-toolbar">
            <div className="page-tabs">
              {["Overview", "Performance", "Events"].map((t) => (
                <button
                  key={t}
                  className={
                    (isOverview && t === "Overview") ||
                    (nav === "Analytics" && t === "Performance") ||
                    (nav === "Alert center" && t === "Events")
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setNav(
                      t === "Overview"
                        ? "Overview"
                        : t === "Performance"
                          ? "Analytics"
                          : "Alert center",
                    )
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="toolbar-right">
              <span className="updated">
                {"Database workspace"}
                <span>·</span>
                {operations.updatedAt
                  ? `Synced ${new Date(operations.updatedAt).toLocaleTimeString("en-GB", { timeZone: "UTC" })}`
                  : "Not yet synced"}
              </span>
              <select
                aria-label={nav + " time range"}
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                <option>24 hours</option>
                <option>7 days</option>
                <option>30 days</option>
              </select>
            </div>
          </div>
          <p className="lookback-note" role="status">
            {nav} lookback: {range} · telemetry and alerts in this period;
            inventory and connection status are current.
            {loading ? " Loading selected period…" : ""}
          </p>
          {!loading && isOverview && (
            <>
              <section className="stats-grid">
                {[
                  {
                    label: "Total assets",
                    value: String(operations.totalAssets),
                    sub: String(sites.length) + " sites",
                    description: "in this workspace",
                    icon: Boxes,
                    color: "var(--accent)",
                  },
                  {
                    label: "Assets online",
                    value: String(online),
                    sub: allAssets.length
                      ? `${((online / allAssets.length) * 100).toFixed(1)}%`
                      : "—",
                    description: "seen within 5 minutes",
                    icon: Radio,
                    color: "var(--green)",
                  },
                  {
                    label: "Active alerts",
                    value: String(operations.totalAlerts),
                    sub: `${alerts.filter((a) => a.severity === "Critical").length} critical`,
                    description: "require attention",
                    icon: Bell,
                    color: "var(--orange)",
                  },
                  {
                    label: "Readings / " + range,
                    value: String(operations.readings24h),
                    unit: "",
                    sub: "Persisted",
                    description: "in this workspace",
                    icon: Activity,
                    color: "var(--accent)",
                  },
                ].map((s, i) => (
                  <article className="stat-card" key={s.label}>
                    <div className="stat-label">
                      {s.label}
                      <s.icon size={16} />
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <span>{s.unit}</span>
                    </div>
                    <div className="stat-sub">
                      <span className={i === 2 ? "warning-text" : "green-text"}>
                        {s.sub}
                      </span>
                      {s.description}
                    </div>
                  </article>
                ))}
              </section>
              <section className="metric-summary">
                {Object.entries(metrics).map(([key, m]) => {
                  const summary = operations.summary?.[key];
                  const value = summary?.value ?? null;
                  const state = summary?.condition ?? "unknown";
                  return (
                    <article
                      key={key}
                      className={"metric-condition " + state}
                      title={limitLabel(m.limits)}
                    >
                      <span>{m.label}</span>
                      <b className="condition-label">{conditionLabel(state)}</b>
                      <strong>
                        {value === null
                          ? "—"
                          : value.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                        <small> {m.unit}</small>
                      </strong>
                      <small>
                        Mean · {summary?.samples ?? 0} readings · {range}
                      </small>
                      <small>
                        Worst recorded state ·{" "}
                        {summary
                          ? `Min ${summary.minimum.toFixed(1)} / Max ${summary.maximum.toFixed(1)} ${m.unit}`
                          : "No readings"}
                      </small>
                      <small>
                        Default limits: {limitLabel(m.limits)} {m.unit} · Device
                        overrides apply
                      </small>
                    </article>
                  );
                })}
              </section>
              <div className="middle-grid">
                <MetricPanel
                  metrics={metrics}
                  range={range}
                  revision={operations.updatedAt}
                />
                <section className="panel fleet-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Global fleet</h2>
                      <p>Connected operations around the world</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Expand fleet map"
                      onClick={() => setNav("Fleet map")}
                    >
                      <Maximize2 size={15} />
                    </button>
                  </div>
                  <FleetMap assets={assets} onSite={(s) => setSite(s)} />
                  <div className="panel-footer">
                    <span>
                      <Globe2 size={13} /> {sites.length} registered locations
                    </span>
                    <button onClick={() => setNav("Fleet map")}>
                      Explore fleet
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          {nav === "Analytics" && (
            <AnalyticsPanel
              metrics={metrics}
              assets={allAssets}
              range={range}
              revision={operations.updatedAt}
              totalAssets={operations.totalAssets}
            />
          )}
          {nav === "Fleet map" && (
            <section className="panel full-map">
              <div className="panel-heading">
                <h2>Global site network</h2>
                <span className="muted">
                  Select a site to inspect its assets
                </span>
              </div>
              <FleetMap assets={assets} onSite={(s) => setSite(s)} />
            </section>
          )}
          {(isOverview || nav === "Digital twins" || nav === "Fleet map") && (
            <div className={`bottom-grid ${!isOverview ? "single" : ""}`}>
              <section className="panel assets-panel">
                <div className="panel-heading">
                  <div className="inline-heading">
                    <h2>Asset overview</h2>
                    <span className="count">{operations.totalAssets}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => {
                      setNav("Digital twins");
                      setSite("All sites");
                      setFilter("All statuses");
                    }}
                  >
                    View all assets
                    <ArrowRight size={13} />
                  </button>
                </div>
                <div className="asset-toolbar">
                  <div className="input-search">
                    <Search size={14} />
                    <input
                      aria-label="Search assets"
                      placeholder="Search assets..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div>
                    <select
                      aria-label="Filter asset status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {[
                        "All statuses",
                        "Healthy",
                        "Warning",
                        "Critical",
                        "Offline",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter site"
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                    >
                      {[
                        "All sites",
                        ...new Set(allAssets.map((a) => a.site)),
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          Asset name <ChevronDown size={10} />
                        </th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>Temperature</th>
                        <th>Power (kW)</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => (
                        <tr
                          key={a.id}
                          onClick={() => setAsset(a)}
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setAsset(a)}
                        >
                          <td>
                            <div className="asset-name">
                              <span className="asset-icon">
                                {a.type === "Pump" ? (
                                  <Activity size={16} />
                                ) : a.type === "Compressor" ? (
                                  <Box size={16} />
                                ) : a.type === "Turbine" ? (
                                  <Zap size={16} />
                                ) : (
                                  <Factory size={16} />
                                )}
                              </span>
                              <span>
                                {a.name}
                                <small>
                                  {a.id.slice(0, 8)} ·{" "}
                                  {a.source === "sample" ? "Sample" : "Device"}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>{a.site}</td>
                          <td>
                            <span
                              className={`status-badge ${a.status.toLowerCase()}`}
                            >
                              <span className="dot" />
                              {a.status}
                            </span>
                          </td>
                          <td
                            className={
                              "condition-text " +
                              condition(a.temperature, {
                                ...metrics.temperature?.limits,
                                ...a.deviceSettings?.alert_rules?.temperature,
                              })
                            }
                          >
                            {a.temperature?.toFixed(1) ?? "—"}{" "}
                            <span className="muted">°C</span>
                          </td>
                          <td
                            className={
                              "condition-text " +
                              condition(a.metrics.power_kw, {
                                ...metrics.power_kw?.limits,
                                ...a.deviceSettings?.alert_rules?.power_kw,
                              })
                            }
                          >
                            {a.metrics.power_kw?.toFixed(1) ?? "—"}
                          </td>
                          <td>
                            <ChevronRight size={13} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="empty-state">
                      No assets match your filters.
                      <button
                        onClick={() => {
                          setFilter("All statuses");
                          setSite("All sites");
                          setSearch("");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    Showing {filtered.length} of {operations.totalAssets} assets{" "}
                    <span className="muted">· Saved records</span>
                  </span>
                  <span className="muted">
                    Select an asset to inspect <ArrowUpRight size={12} />
                  </span>
                </div>
              </section>
              {isOverview && (
                <section className="panel alerts-panel">
                  <div className="panel-heading">
                    <div className="inline-heading">
                      <h2>Recent alerts</h2>
                      <span className="count alert-count">{alerts.length}</span>
                    </div>
                    <button
                      aria-label="View all alerts"
                      onClick={() => setNav("Alert center")}
                    >
                      <Ellipsis size={19} />
                    </button>
                  </div>
                  <div className="alert-list">
                    {alerts.map((a) => (
                      <button
                        className="alert-item"
                        key={a.id}
                        onClick={() =>
                          setAsset(
                            allAssets.find((x) => x.name === a.asset) ?? null,
                          )
                        }
                      >
                        <span
                          className={`alert-symbol ${a.severity.toLowerCase()}`}
                        >
                          <Activity size={15} />
                        </span>
                        <div>
                          <div className="alert-title">{a.title}</div>
                          <p>{a.asset}</p>
                          <small>
                            <span
                              className={
                                a.severity === "Critical"
                                  ? "red-text"
                                  : a.severity === "Warning"
                                    ? "warning-text"
                                    : "muted"
                              }
                            >
                              {a.severity}
                            </span>
                            <span>·</span>
                            {new Date(a.time).toLocaleString("en-GB", {
                              timeZone: "UTC",
                            })}
                          </small>
                        </div>
                        <ChevronRight size={13} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="alerts-link"
                    onClick={() => setNav("Alert center")}
                  >
                    Go to alert center <ArrowRight size={13} />
                  </button>
                </section>
              )}
            </div>
          )}
          {nav === "Alert center" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  Alert history <span className="count">{alerts.length}</span>
                </h2>
                <Button
                  onClick={() => void acknowledgeAll()}
                  disabled={
                    !canAck ||
                    saving ||
                    !alerts.some((a) => a.status === "open")
                  }
                >
                  <CheckCheck size={15} />
                  Acknowledge all
                </Button>
              </div>
              {alerts.map((a) => (
                <div className="alert-detail" key={a.id}>
                  <span className={`status-badge ${a.severity.toLowerCase()}`}>
                    {a.severity}
                  </span>
                  <div>
                    <h3>{a.title}</h3>
                    <p>
                      {a.asset} · {a.site} · {a.id}
                    </p>
                  </div>
                  <span className="muted">
                    {new Date(a.time).toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}
                  </span>
                  <Button
                    disabled={!canAck || saving || a.status !== "open"}
                    onClick={() =>
                      void mutate(
                        `alerts/${a.id}/acknowledge`,
                        "POST",
                        { note: "Acknowledged from command center" },
                        "Alert acknowledged",
                      )
                    }
                  >
                    <Check size={14} />
                    {a.status === "open" ? "Acknowledge" : "Acknowledged"}
                  </Button>
                </div>
              ))}
              {!alerts.length && (
                <div className="empty-state">
                  <ShieldCheck size={32} />
                  <h3>You're all caught up</h3>
                  <p>There are no alerts in this lookback.</p>
                </div>
              )}
            </section>
          )}
          {nav === "Maintenance" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Maintenance history · {range}</h2>
              </div>
              {(operations.maintenanceHistory ?? []).map((entry, i) => (
                <div
                  className="alert-detail"
                  key={entry.deviceId + entry.time + i}
                >
                  <span className="status-badge">
                    {entry.maintenance_status}
                  </span>
                  <div>
                    <h3>{entry.asset}</h3>
                    <p>
                      {entry.maintenance_note || "Schedule updated"} · Due{" "}
                      {entry.maintenance_due ?? "not set"}
                    </p>
                  </div>
                  <time>
                    {new Date(entry.time).toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}
                  </time>
                </div>
              ))}
              {!operations.maintenanceHistory?.length && (
                <p className="empty-state">
                  No recorded maintenance changes in this period. History starts
                  when a schedule is next edited.
                </p>
              )}
              <div className="panel-heading">
                <h2>Current maintenance schedules</h2>
                <span className="muted">
                  Saved maintenance schedules · edit in the asset inspector
                </span>
              </div>
              {!assets.some((a) => a.maintenanceStatus !== "Not scheduled") && (
                <div className="empty-state">
                  No maintenance scheduled. Open an asset to set a due date and
                  service notes.
                </div>
              )}
              {assets
                .filter((a) => a.maintenanceStatus !== "Not scheduled")
                .map((a, i) => (
                  <div className="alert-detail" key={a.id}>
                    <span className="asset-icon">
                      <Wrench size={18} />
                    </span>
                    <div>
                      <h3>{a.maintenanceNote || "Equipment service"}</h3>
                      <p>
                        {a.name} · {a.site}
                      </p>
                    </div>
                    <span
                      className={`status-badge ${a.maintenanceStatus === "Completed" ? "healthy" : "warning"}`}
                    >
                      {a.maintenanceStatus} ·{" "}
                      {a.maintenanceDue || "No due date"}
                    </span>
                    <Button onClick={() => setAsset(a)}>
                      Inspect asset
                      <ArrowRight size={14} />
                    </Button>
                  </div>
                ))}
            </section>
          )}
          {nav === "Asset hierarchy" && (
            <HierarchyPanel assets={allAssets} onInspect={setAsset} />
          )}
          {nav === "Audit logs" && canAudit && (
            <AuditPanel key={hours} hours={hours} />
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={12} /> Authenticated workspace <i /> All times
              in UTC
            </span>
            <span>
              Powered by <strong>markup ventures</strong>
              <span className="version">v.2.8.1</span>
            </span>
          </footer>
        </main>
      </div>
      {asset && (
        <div className="overlay" onClick={() => setAsset(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="panel-heading">
              <span className="eyebrow">DIGITAL TWIN</span>
              <button
                aria-label="Close inspector"
                onClick={() => setAsset(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-content">
              <span className="twin-art">
                <Boxes size={68} strokeWidth={1} />
              </span>
              <h2>{asset.name}</h2>
              <p>
                {asset.id} · {asset.site}
              </p>
              <span className={`status-badge ${asset.status.toLowerCase()}`}>
                <i className="dot" />
                {asset.status}
              </span>
              <div className="twin-metrics">
                <div>
                  Temperature<strong>{asset.temperature ?? "—"} °C</strong>
                </div>
                <div>
                  Vibration<strong>{asset.vibration ?? "—"} mm/s</strong>
                </div>
              </div>
              <h3>Device properties</h3>
              <dl>
                <div>
                  <dt>Firmware</dt>
                  <dd>{asset.firmware}</dd>
                </div>
                <div>
                  <dt>Data source</dt>
                  <dd>{asset.source}</dd>
                </div>
                <div>
                  <dt>Last seen</dt>
                  <dd>
                    {asset.lastSeen
                      ? new Date(asset.lastSeen).toLocaleString("en-GB", {
                          timeZone: "UTC",
                        })
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt>Connection</dt>
                  <dd>Stored telemetry</dd>
                </div>
              </dl>
              <h3>Reported state</h3>
              <pre>
                {JSON.stringify(
                  {
                    device_id: asset.id,
                    status: asset.status.toLowerCase(),
                    metrics: {
                      temperature: asset.temperature,
                      vibration: asset.vibration,
                    },
                    firmware: asset.firmware,
                  },
                  null,
                  2,
                )}
              </pre>
              <div className="metric-readings">
                {Object.entries(metrics).map(([key, m]) => (
                  <div
                    key={key}
                    className={
                      "metric-condition " +
                      condition(asset.metrics[key], {
                        ...m.limits,
                        ...asset.deviceSettings?.alert_rules?.[key],
                      })
                    }
                    title={limitLabel(m.limits)}
                  >
                    <span>
                      {m.label} ·{" "}
                      {conditionLabel(
                        condition(asset.metrics[key], {
                          ...m.limits,
                          ...asset.deviceSettings?.alert_rules?.[key],
                        }),
                      )}
                    </span>
                    <strong>
                      {asset.metrics[key]?.toLocaleString() ?? "—"} {m.unit}
                    </strong>
                  </div>
                ))}
              </div>
              <PlatformPanel
                key={"platform-" + asset.id}
                asset={asset}
                assets={allAssets}
                metrics={metrics}
                role={user.role}
                onSaved={refresh}
              />
              {canWrite && (
                <AssetControls
                  key={asset.id}
                  asset={asset}
                  metrics={metrics}
                  onSaved={async () => {
                    await refresh();
                    setToast("Changes saved to database");
                    setAsset(null);
                  }}
                />
              )}
            </div>
          </aside>
        </div>
      )}
      {searchOpen && (
        <div
          className="overlay modal-overlay"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="modal search-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="global-search">
              <Search size={20} />
              <input
                autoFocus
                placeholder="Search assets, sites, or pages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button onClick={() => setSearchOpen(false)}>Esc</button>
            </div>
            <div className="search-results">
              {navigation
                .filter((n) =>
                  n.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((n) => (
                  <button
                    key={n.name}
                    onClick={() => {
                      setNav(n.name);
                      setSearchOpen(false);
                      setSearch("");
                    }}
                  >
                    <n.icon size={17} />
                    {n.name}
                    <ArrowRight size={14} />
                  </button>
                ))}
              {allAssets
                .filter((a) =>
                  `${a.name} ${a.site}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAsset(a);
                      setSearchOpen(false);
                      setSearch("");
                    }}
                  >
                    <Boxes size={17} />
                    {a.name}
                    <small>{a.site}</small>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {modal && (
        <div className="overlay modal-overlay" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "asset"
                ? "Register an asset"
                : modal === "report"
                  ? "Export report"
                  : "Workspace settings"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>
                {modal === "asset"
                  ? "Register an asset"
                  : modal === "report"
                    ? "Export fleet report"
                    : "Workspace settings"}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal(null)}>
                <X size={18} />
              </button>
            </div>
            {modal === "asset" ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const saved = await mutate(
                    "assets",
                    "POST",
                    {
                      name: String(f.get("name")),
                      kind: String(f.get("kind")),
                      parent_id: f.get("parent") || null,
                      desired: {
                        site: String(f.get("site")),
                        equipment_type: String(f.get("type")),
                        firmware: "Unknown",
                        data_source: "device",
                      },
                    },
                    "Asset saved to database",
                  );
                  if (saved) {
                    setModal(null);
                    setNav("Digital twins");
                    setSite("All sites");
                    setFilter("All statuses");
                  }
                }}
              >
                <p>Register a digital twin in your workspace database.</p>
                <label>
                  Asset name
                  <input
                    name="name"
                    required
                    placeholder="e.g. Hydraulic Pump A2"
                    maxLength={80}
                  />
                </label>
                <label>
                  Hierarchy level
                  <select name="kind" defaultValue="machine">
                    {[
                      "enterprise",
                      "region",
                      "plant",
                      "line",
                      "machine",
                      "sensor",
                    ].map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Parent asset
                  <select name="parent">
                    <option value="">Top level</option>
                    {allAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Asset type
                  <select name="type">
                    <option>Pump</option>
                    <option>Motor</option>
                    <option>Turbine</option>
                    <option>Generator</option>
                    <option>Compressor</option>
                  </select>
                </label>
                <label>
                  Location
                  <input
                    name="site"
                    required
                    maxLength={120}
                    placeholder="e.g. Houston Plant"
                  />
                </label>
                <Button className="primary" type="submit" disabled={saving}>
                  <Plus size={16} />
                  Register asset
                </Button>
              </form>
            ) : modal === "report" ? (
              <div className="modal-body">
                <p>
                  Download the {filtered.length} visible saved assets, including
                  status and all recorded metric values.
                </p>
                <div className="export-format">
                  <ArrowDownToLine size={24} />
                  <div>
                    Fleet telemetry report
                    <small>CSV · Current filters · {range}</small>
                  </div>
                  <Check size={17} />
                </div>
                <Button
                  className="primary"
                  onClick={() => {
                    exportData();
                    setModal(null);
                  }}
                >
                  <Download size={15} />
                  Download CSV
                </Button>
              </div>
            ) : (
              <div className="modal-body">
                <label>
                  Workspace
                  <input readOnly value="Markup Ventures" />
                </label>
                <label>
                  Operator role
                  <input readOnly value="FleetOperator" />
                </label>
                <label>
                  Data connection
                  <input
                    readOnly
                    value={"PostgreSQL · refresh every 10 seconds"}
                  />
                </label>
                <p>
                  Assets, readings, maintenance settings, and alert
                  acknowledgments are saved to PostgreSQL and survive refreshes.
                </p>
                <Button onClick={() => setModal(null)}>Done</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
