"use client";
import { worldOutline } from "@/lib/world-outline";
import { useState } from "react";
import { Plus, Minus, Maximize2 } from "lucide-react";
const coordinates = [
  { name: "Houston Plant", latitude: 29.76, longitude: -95.37 },
  { name: "Berlin Facility", latitude: 52.52, longitude: 13.405 },
  { name: "Rotterdam Hub", latitude: 51.92, longitude: 4.48 },
  { name: "Singapore Plant", latitude: 1.35, longitude: 103.82 },
  { name: "São Paulo Hub", latitude: -23.55, longitude: -46.63 },
  { name: "Sydney Facility", latitude: -33.87, longitude: 151.21 },
];
export function FleetMap({
  onSite,
  assets,
}: {
  onSite: (site: string) => void;
  assets: import("@/lib/operations").Asset[];
}) {
  const groups = new Map<
    string,
    { name: string; latitude: number; longitude: number; rows: typeof assets }
  >();
  let unmapped = 0;
  for (const asset of assets) {
    const fallback = coordinates.find((c) => c.name === asset.site);
    const latitude = asset.deviceSettings?.latitude ?? fallback?.latitude;
    const longitude = asset.deviceSettings?.longitude ?? fallback?.longitude;
    if (latitude == null || longitude == null) {
      unmapped++;
      continue;
    }
    const key = asset.site + ":" + latitude + ":" + longitude;
    const group = groups.get(key) ?? {
      name: asset.site,
      latitude,
      longitude,
      rows: [],
    };
    group.rows.push(asset);
    groups.set(key, group);
  }
  const sites = [...groups.entries()].map(([id, g]) => ({
    ...g,
    id,
    x: 30 + ((g.longitude + 180) / 360) * 720,
    y: 25 + ((90 - g.latitude) / 180) * 260,
    count: g.rows.length,
    status: g.rows.some((a) => a.status === "Critical")
      ? "critical"
      : g.rows.some((a) => a.status === "Warning")
        ? "warning"
        : g.rows.every((a) => a.status === "Offline")
          ? "offline"
          : "healthy",
  }));
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState("Houston Plant");
  return (
    <div className="map">
      <svg
        viewBox="0 0 780 310"
        role="img"
        aria-label="Geographic fleet coordinates, longitude and latitude"
      >
        <defs>
          <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.25" fill="var(--muted)" opacity=".5" />
          </pattern>
          <radialGradient id="glow">
            <stop stopColor="var(--accent)" stopOpacity=".09" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="780" height="310" fill="url(#glow)" />
        <g
          transform={`translate(${390 - 390 * zoom} ${155 - 155 * zoom}) scale(${zoom})`}
        >
          <path
            d={worldOutline}
            fill="var(--surface-2)"
            stroke="var(--muted)"
            strokeWidth=".4"
            opacity=".8"
          />
          <g stroke="var(--line)" strokeWidth=".6">
            {[-180, -120, -60, 0, 60, 120, 180].map((lon) => (
              <line
                key={lon}
                x1={30 + (lon + 180) * 2}
                x2={30 + (lon + 180) * 2}
                y1="25"
                y2="285"
              />
            ))}
            {[-90, -60, -30, 0, 30, 60, 90].map((lat) => (
              <line
                key={lat}
                x1="30"
                x2="750"
                y1={25 + ((90 - lat) / 180) * 260}
                y2={25 + ((90 - lat) / 180) * 260}
              />
            ))}
          </g>
          <g fill="var(--muted)" fontSize="9">
            {[-180, -120, -60, 0, 60, 120, 180].map((lon) => (
              <text
                key={lon}
                x={30 + (lon + 180) * 2}
                y="304"
                textAnchor="middle"
              >
                {lon}°
              </text>
            ))}
            {[-60, 0, 60].map((lat) => (
              <text key={lat} x="2" y={28 + ((90 - lat) / 180) * 260}>
                {lat}°
              </text>
            ))}
            <text x="390" y="13" textAnchor="middle">
              GEOGRAPHIC FLEET · LATITUDE / LONGITUDE
            </text>
          </g>
          {sites.map((s) => (
            <g
              key={s.id}
              onClick={() => {
                setSelected(s.id);
                onSite(s.name);
              }}
              className={`map-marker ${s.status}`}
              role="button"
              tabIndex={0}
              aria-label={`${s.name}, ${s.count} assets, ${s.latitude} latitude, ${s.longitude} longitude`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setSelected(s.id);
                  onSite(s.name);
                }
              }}
            >
              <circle cx={s.x} cy={s.y} r="12" opacity=".12" />
              <circle cx={s.x} cy={s.y} r="6" opacity=".3" />
              <circle cx={s.x} cy={s.y} r="3" />
              {selected === s.id && (
                <g>
                  <rect
                    x={s.x - 52}
                    y={s.y - 47}
                    width="110"
                    height="31"
                    rx="5"
                    fill="var(--surface)"
                    stroke="var(--line)"
                  />
                  <text
                    x={s.x + 3}
                    y={s.y - 28}
                    textAnchor="middle"
                    fill="var(--text)"
                    fontSize="10"
                  >
                    {s.name}
                  </text>
                </g>
              )}
            </g>
          ))}
        </g>
      </svg>
      <div className="map-controls">
        <button
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(z + 0.25, 2))}
        >
          <Plus size={14} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}
        >
          <Minus size={14} />
        </button>
        <button aria-label="Reset map view" onClick={() => setZoom(1)}>
          <Maximize2 size={13} />
        </button>
      </div>
      <div className="map-legend">
        <span>
          <i className="dot healthy" />
          Healthy
        </span>
        <span>
          <i className="dot warning" />
          Warning
        </span>
        <span>
          <i className="dot critical" />
          Critical
        </span>
        <span>
          <i className="dot offline" />
          Offline
        </span>
      </div>
      <span className="map-caption">
        {sites.length} locations · {unmapped} assets without coordinates
      </span>
    </div>
  );
}
