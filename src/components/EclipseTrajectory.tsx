import { useEffect, useMemo, useRef } from "react";
import { calculateSkyState } from "../eclipse-logic";
import { eclipseEvents } from "../live-view";
import { normalizeDegrees, type SkyViewState } from "../sky-guide";
import { drawSkyGuideScene } from "../sky-guide-renderer";
import { createSkyGuideScene } from "../sky-guide-scene";
import type { EclipseWindow, ObserverLocation } from "../types";

type Props = {
  location: ObserverLocation;
  window: EclipseWindow;
  now: Date;
  formatTime: (date: Date) => string;
  onSelectTime: (date: Date) => void;
};

const directionFor = (azimuth: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(normalizeDegrees(azimuth) / 45) % 8
  ];

export function EclipseTrajectory({
  location,
  window,
  now,
  formatTime,
  onSelectTime,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const events = useMemo(
    () =>
      eclipseEvents(window).map((event) => ({
        ...event,
        state: calculateSkyState(event.time, location, window),
      })),
    [location, window],
  );
  const liveAvailable = now >= window.start && now <= window.end;
  const targetTime = liveAvailable ? now : window.peak;
  const targetLabel = liveAvailable ? "Live now" : "Maximum eclipse";
  const scene = useMemo(
    () =>
      createSkyGuideScene(targetTime, targetLabel, location, window, events),
    [events, location, targetLabel, targetTime, window],
  );
  const view = useMemo<SkyViewState>(
    () => ({
      azimuthDeg: scene.target.azimuthDeg,
      altitudeDeg: scene.target.altitudeDeg,
      rollDeg: 0,
      fovDeg: 100,
    }),
    [scene.target.altitudeDeg, scene.target.azimuthDeg],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(rect.width * dpr);
      const pixelHeight = Math.round(rect.height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSkyGuideScene(context, rect.width, rect.height, scene, view);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [scene, view]);

  return (
    <div className="trajectory-wrap">
      <canvas
        ref={canvasRef}
        className="trajectory-sky-preview"
        data-testid="trajectory-sky-preview"
        role="img"
        aria-label={`All-sphere sky-guide preview centered on ${targetLabel.toLowerCase()}. Full dashed Sun and Moon paths, true horizon, and eclipse contact markers are shown.`}
      />
      <div
        className="trajectory-preview-legend sky-trajectory-legend"
        aria-label="Sky preview legend"
      >
        <span className="sun-path-key">Sun · 360° path</span>
        <span className="moon-path-key">Moon · 360° path</span>
        <span className="true-scale-key">True-scale disks · locator halos</span>
      </div>
      <div
        className="live-event-list"
        aria-label="Eclipse event times and directions"
      >
        {events.map((event) => {
          const difference = event.time.getTime() - now.getTime();
          const state = difference > 0 ? "upcoming" : "past";
          const sun = event.state.sun;
          return (
            <button
              className={state}
              data-testid={`live-event-${event.key.toLowerCase()}`}
              key={event.key}
              onClick={() => onSelectTime(event.time)}
              aria-label={`${event.key}, ${event.label}, ${formatTime(event.time)}, azimuth ${Math.round(sun.azimuthDeg)} degrees ${directionFor(sun.azimuthDeg)}, altitude ${Math.round(sun.altitudeDeg)} degrees`}
            >
              <span className="event-code">{event.key}</span>
              <span>
                <strong>{event.label}</strong>
                <small className="event-sky-coordinates">
                  <time dateTime={event.time.toISOString()}>
                    {formatTime(event.time)}
                  </time>
                  <span>
                    {Math.round(sun.azimuthDeg)}° {directionFor(sun.azimuthDeg)}
                    · {Math.round(sun.altitudeDeg)}° altitude
                  </span>
                </small>
              </span>
              <span className="event-relative">
                {difference > 0 ? formatCountdownShort(difference) : "Passed"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatCountdownShort(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `in ${days}d ${hours}h`;
  if (hours) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}
