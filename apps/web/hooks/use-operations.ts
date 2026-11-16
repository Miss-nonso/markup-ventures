"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { api, type Snapshot, type Metrics } from "@/lib/operations";
export function useOperations(
  paused: boolean,
  hours = 24,
  includeHistory = false,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    assets: [],
    alerts: [],
    readings24h: 0,
    totalAssets: 0,
    totalAlerts: 0,
    limit: 500,
    updatedAt: "",
  });
  const [resolvedKey, setResolvedKey] = useState("");
  const requestKey = hours + ":" + includeHistory;
  const [metrics, setMetrics] = useState<Metrics>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await api<Snapshot>(
        `dashboard?hours=${hours}&include_history=${includeHistory}`,
      );
      if (current === sequence.current) {
        setSnapshot(data);
        setResolvedKey(hours + ":" + includeHistory);
        setError("");
      }
    } catch (e) {
      if (current === sequence.current)
        setError(e instanceof Error ? e.message : "Unable to load operations");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [hours, includeHistory]);
  useEffect(() => {
    api<Metrics>("metrics")
      .then(setMetrics)
      .catch((e) => setError(e.message));
    api<{ enabled: boolean }>("auth/demo")
      .then((v) => setDemoEnabled(v.enabled))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setLoading(true);
    void refresh();
    if (paused)
      return () => {
        sequence.current++;
      };
    const timer = setInterval(refresh, 10000);
    return () => {
      clearInterval(timer);
      sequence.current++;
    };
  }, [refresh, paused]);
  useEffect(() => {
    if (paused) {
      setStreaming(false);
      return;
    }
    const events = new EventSource("/api/backend/events");
    let pending: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("ready", () => setStreaming(true));
    events.onmessage = () => {
      if (!pending)
        pending = setTimeout(() => {
          pending = undefined;
          void refresh();
        }, 200);
    };
    events.onerror = () => setStreaming(false);
    return () => {
      events.close();
      clearTimeout(pending);
      setStreaming(false);
    };
  }, [paused, refresh]);
  const matches = resolvedKey === requestKey;
  return {
    ...snapshot,
    ...(matches
      ? {}
      : {
          assets: [],
          alerts: [],
          summary: {},
          maintenanceHistory: [],
          liveErrors: [],
        }),
    metrics,
    error,
    loading: loading || (!matches && !error),
    demoEnabled,
    streaming,
    refresh,
  };
}
