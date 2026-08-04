import type { EclipseWindow } from "./types";

export type EclipseEventKey = "C1" | "C2" | "MAX" | "C3" | "C4";

export type EclipseEvent = {
  key: EclipseEventKey;
  label: string;
  time: Date;
};

export type LivePhase =
  "before" | "partial-in" | "total" | "partial-out" | "after";

export type LiveSituation = {
  phase: LivePhase;
  title: string;
  detail: string;
  nextEvent?: EclipseEvent;
};

export function eclipseEvents(window: EclipseWindow): EclipseEvent[] {
  const events: EclipseEvent[] = [
    { key: "C1", label: "Partial eclipse begins", time: window.start },
  ];
  if (window.totalStart) {
    events.push({
      key: "C2",
      label: "Totality begins",
      time: window.totalStart,
    });
  }
  events.push({ key: "MAX", label: "Maximum eclipse", time: window.peak });
  if (window.totalEnd) {
    events.push({
      key: "C3",
      label: "Totality ends",
      time: window.totalEnd,
    });
  }
  events.push({ key: "C4", label: "Partial eclipse ends", time: window.end });
  return events;
}

export function liveSituation(now: Date, window: EclipseWindow): LiveSituation {
  const time = now.getTime();
  const events = eclipseEvents(window);
  const nextEvent = events.find((event) => event.time.getTime() > time);

  if (time < window.start.getTime()) {
    return {
      phase: "before",
      title: "The eclipse is on its way",
      detail: "Your live guide will follow every contact from this location.",
      nextEvent,
    };
  }
  if (time > window.end.getTime()) {
    return {
      phase: "after",
      title: "The local eclipse has ended",
      detail: "Replay any contact to revisit what happened in your sky.",
    };
  }
  if (
    window.totalStart &&
    window.totalEnd &&
    time >= window.totalStart.getTime() &&
    time <= window.totalEnd.getTime()
  ) {
    return {
      phase: "total",
      title: "Totality is happening now",
      detail: "The bright photosphere is fully covered at this location.",
      nextEvent,
    };
  }
  if (time <= window.peak.getTime()) {
    return {
      phase: "partial-in",
      title: "The partial eclipse is building",
      detail: "The Moon is moving toward maximum coverage.",
      nextEvent,
    };
  }
  return {
    phase: "partial-out",
    title: "The partial eclipse is receding",
    detail: "The Moon is moving away after maximum coverage.",
    nextEvent,
  };
}

export function formatCountdown(milliseconds: number) {
  if (milliseconds <= 0) return "Now";
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}
