"use client";
import { useEffect, useState } from "react";
import { series } from "@/lib/data";
export function useTelemetryStream(paused: boolean) {
  const [data, setData] = useState(() => series(0));
  const [connected, setConnected] = useState(false);
  const url = process.env.NEXT_PUBLIC_WS_URL;
  useEffect(() => {
    if (paused) return;
    if (!url) {
      let tick = 0;
      const id = setInterval(() => setData(series(++tick * 0.05)), 5000);
      return () => clearInterval(id);
    }
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let attempt = 0;
    function connect() {
      socket = new WebSocket(url!);
      socket.onopen = () => {
        setConnected(true);
        attempt = 0;
      };
      socket.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.metrics)
            setData((old) => [
              ...old.slice(1),
              {
                time: new Date(event.timestamp).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                temperature: event.metrics.temperature ?? 0,
                pressure: event.metrics.pressure ?? 0,
                vibration: event.metrics.vibration ?? 0,
              },
            ]);
        } catch {}
      };
      socket.onclose = (event) => {
        setConnected(false);
        if (event.code === 1008) {
          window.location.replace("/login");
          return;
        }
        if (!stopped)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [paused, url]);
  return { data, connected, demo: !url };
}
