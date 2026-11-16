"use client";
import { useEffect, useRef, useState } from "react";
export function AlarmToggle({
  breaches,
  paused,
}: {
  breaches: string[];
  paused: boolean;
}) {
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef(new Set<string>());
  const lastBeep = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  function beep() {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.36);
  }
  useEffect(() => {
    if (!enabled || paused || !breaches.length) {
      if (!breaches.length) previous.current = new Set();
      return;
    }
    const current = new Set(breaches);
    if (
      breaches.some((key) => !previous.current.has(key)) &&
      Date.now() - lastBeep.current >= 15000
    ) {
      beep();
      lastBeep.current = Date.now();
    }
    previous.current = current;
    // Keep the reminder clock stable even when polling replaces the array.
    const timer = setInterval(() => {
      if (Date.now() - lastBeep.current >= 15000) {
        beep();
        lastBeep.current = Date.now();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [breaches, enabled, paused]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      void audio.current?.suspend();
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      previous.current = new Set(breaches);
      beep(); // Unlock and confirm audio in the user gesture.
      lastBeep.current = Date.now();
      setEnabled(true);
      setError("");
    } catch {
      setError("Audio unavailable in this browser.");
    }
  }
  return (
    <div className={"alarm-control " + (breaches.length ? "has-critical" : "")}>
      <button
        className="theme-toggle"
        aria-pressed={enabled}
        onClick={() => void toggle()}
        title="Enable audio to hear a beep every 15 seconds while recent critical readings persist. Click again to mute."
      >
        {enabled ? "Mute alarms" : "Enable critical alarms"}
      </button>
      <small role="status">
        {paused
          ? "Monitoring paused"
          : breaches.length
            ? `${breaches.length} live critical · ${enabled ? "sound on" : "sound off"}`
            : enabled
              ? "Sound armed"
              : "Sound off"}
      </small>
      {error && <small role="status">{error}</small>}
    </div>
  );
}
