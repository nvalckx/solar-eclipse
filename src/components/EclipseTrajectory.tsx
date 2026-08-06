import { useEffect, useMemo, useRef } from "react";
import { calculateSkyState } from "../eclipse-logic";
import { eclipseEvents, type EclipseEvent } from "../live-view";
import { normalizeDegrees, type SkyViewState } from "../sky-guide";
import { drawSkyGuideScene } from "../sky-guide-renderer";
import { createSkyGuideScene, type SkyGuideScene } from "../sky-guide-scene";
import type { EclipseWindow, ObserverLocation, SkyState } from "../types";
import { EclipseDiskOverlay } from "./EclipseDiskOverlay";

type Props = {
  location: ObserverLocation;
  window: EclipseWindow;
  now: Date;
  formatTime: (date: Date) => string;
  onSelectTime: (date: Date) => void;
};

type SnapshotMoment = {
  key: string;
  label: string;
  time: Date;
};

type Snapshot = SnapshotMoment & { state: SkyState };

const directionFor = (azimuth: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(normalizeDegrees(azimuth) / 45) % 8
  ];

const between = (start: Date, end: Date, fraction: number) =>
  new Date(start.getTime() + (end.getTime() - start.getTime()) * fraction);

export function eclipseSnapshotMoments(
  events: EclipseEvent[],
): SnapshotMoment[] {
  const byKey = new Map(events.map((event) => [event.key, event]));
  const first = byKey.get("C1")!;
  const maximum = byKey.get("MAX")!;
  const last = byKey.get("C4")!;
  const totalStart = byKey.get("C2");
  const totalEnd = byKey.get("C3");

  if (totalStart && totalEnd) {
    return [
      first,
      {
        key: "PRE_TOTAL",
        label: "Approaching totality",
        time: between(first.time, totalStart.time, 0.58),
      },
      totalStart,
      maximum,
      totalEnd,
      {
        key: "POST_TOTAL",
        label: "Leaving totality",
        time: between(totalEnd.time, last.time, 0.42),
      },
      last,
    ];
  }

  return [
    first,
    {
      key: "BUILD_1",
      label: "Eclipse building",
      time: between(first.time, maximum.time, 1 / 3),
    },
    {
      key: "BUILD_2",
      label: "Near maximum",
      time: between(first.time, maximum.time, 2 / 3),
    },
    maximum,
    {
      key: "RECEDE_1",
      label: "After maximum",
      time: between(maximum.time, last.time, 1 / 3),
    },
    {
      key: "RECEDE_2",
      label: "Eclipse receding",
      time: between(maximum.time, last.time, 2 / 3),
    },
    last,
  ];
}

function SkySnapshot({
  snapshot,
  baseScene,
  formatTime,
  onSelectTime,
}: {
  snapshot: Snapshot;
  baseScene: SkyGuideScene;
  formatTime: (date: Date) => string;
  onSelectTime: (date: Date) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo<SkyGuideScene>(
    () => ({
      ...baseScene,
      state: snapshot.state,
      target: snapshot.state.sun,
      targetLabel: snapshot.label,
      targetObservable: snapshot.state.sun.altitudeDeg > -0.833,
    }),
    [baseScene, snapshot],
  );
  const view = useMemo<SkyViewState>(
    () => ({
      azimuthDeg: snapshot.state.sun.azimuthDeg,
      altitudeDeg: snapshot.state.sun.altitudeDeg,
      rollDeg: 0,
      fovDeg: 100,
    }),
    [snapshot.state.sun.altitudeDeg, snapshot.state.sun.azimuthDeg],
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

  const sun = snapshot.state.sun;
  const time = formatTime(snapshot.time);
  return (
    <button
      className="trajectory-snapshot"
      data-testid={`trajectory-snapshot-${snapshot.key.toLowerCase()}`}
      onClick={() => onSelectTime(snapshot.time)}
      aria-label={`${snapshot.label}, ${time}, azimuth ${Math.round(sun.azimuthDeg)} degrees ${directionFor(sun.azimuthDeg)}, altitude ${Math.round(sun.altitudeDeg)} degrees`}
    >
      <span className="trajectory-snapshot-visual">
        <canvas ref={canvasRef} aria-hidden="true" />
        <EclipseDiskOverlay state={snapshot.state} visible />
      </span>
      <span className="trajectory-snapshot-copy">
        <strong>{snapshot.label}</strong>
        <time dateTime={snapshot.time.toISOString()}>{time}</time>
        <small>
          {Math.round(sun.azimuthDeg)}° {directionFor(sun.azimuthDeg)} ·{" "}
          {Math.round(sun.altitudeDeg)}° altitude
        </small>
      </span>
    </button>
  );
}

export function EclipseTrajectory({
  location,
  window,
  now,
  formatTime,
  onSelectTime,
}: Props) {
  const events = useMemo(() => eclipseEvents(window), [window]);
  const snapshots = useMemo(
    () =>
      eclipseSnapshotMoments(events).map((moment) => ({
        ...moment,
        state: calculateSkyState(moment.time, location, window),
      })),
    [events, location, window],
  );
  const baseScene = useMemo(
    () =>
      createSkyGuideScene(
        window.peak,
        "Maximum eclipse",
        location,
        window,
        events,
      ),
    [events, location, window],
  );
  const eventStates = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        state: calculateSkyState(event.time, location, window),
      })),
    [events, location, window],
  );

  return (
    <div className="trajectory-wrap">
      <div className="trajectory-snapshot-heading">
        <span>Progress from C1 to C4</span>
        <small>Choose a snapshot to preview that moment</small>
      </div>
      <div
        className="trajectory-snapshot-strip"
        data-testid="trajectory-snapshot-strip"
        aria-label="Eclipse progression snapshots from first to fourth contact"
      >
        {snapshots.map((snapshot) => (
          <SkySnapshot
            key={snapshot.key}
            snapshot={snapshot}
            baseScene={baseScene}
            formatTime={formatTime}
            onSelectTime={onSelectTime}
          />
        ))}
      </div>
      <div
        className="trajectory-preview-legend sky-trajectory-legend"
        aria-label="Sky preview legend"
      >
        <span className="sun-path-key">Sun · 360° path</span>
        <span className="moon-path-key">Moon · 360° path</span>
        <span className="true-scale-key">
          Overlap detail magnifies size + separation together
        </span>
      </div>
      <div
        className="live-event-list"
        aria-label="Eclipse event times and directions"
      >
        {eventStates.map((event) => {
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
