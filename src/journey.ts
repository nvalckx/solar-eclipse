import type { EclipseWindow, ObserverLocation, SkyState } from "./types";

export type LivePromotion = "none" | "starting-soon" | "live" | "replay-ready";

const PROMOTION_BEFORE_MS = 6 * 60 * 60_000;
const PROMOTION_AFTER_MS = 2 * 60 * 60_000;

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function cardinalDirection(azimuth: number) {
  return CARDINALS[Math.round(azimuth / 45) % CARDINALS.length];
}

export function altitudeDescription(altitude: number) {
  if (altitude <= -0.833) return "below the horizon";
  if (altitude <= 10) return "very low";
  if (altitude <= 25) return "low";
  if (altitude <= 50) return "mid-sky";
  return "high";
}

export function directionDescription(azimuth: number, altitude: number) {
  const direction = cardinalDirection(azimuth);
  if (altitude <= -0.833)
    return `${direction} (${Math.round(azimuth)}°), below the horizon`;
  return `${direction} (${Math.round(azimuth)}°), ${altitudeDescription(altitude)} — ${Math.round(altitude)}° above the horizon`;
}

export function livePromotionAt(
  now: Date,
  eclipseWindow: EclipseWindow,
): LivePromotion {
  const time = now.getTime();
  const start = eclipseWindow.start.getTime();
  const end = eclipseWindow.end.getTime();
  if (time < start - PROMOTION_BEFORE_MS) return "none";
  if (time < start) return "starting-soon";
  if (time <= end) return "live";
  if (time <= end + PROMOTION_AFTER_MS) return "replay-ready";
  return "none";
}

export type LocalBriefing = {
  title: string;
  summary: string;
  direction: string;
  coverage: string;
  safety: string;
};

export function localBriefing(
  location: ObserverLocation,
  eclipseWindow: EclipseWindow,
  maximumState: SkyState,
  formatTime: (date: Date) => string,
): LocalBriefing {
  const coverage = Math.round(eclipseWindow.peakObscuration * 100);
  const phase =
    eclipseWindow.localType === "total"
      ? "total eclipse"
      : eclipseWindow.localType === "annular"
        ? "annular eclipse"
        : "partial eclipse";
  const title = `${phase[0].toUpperCase()}${phase.slice(1)} from ${location.label}`;
  const duration =
    eclipseWindow.centralStart && eclipseWindow.centralEnd
      ? Math.round(
          (eclipseWindow.centralEnd.getTime() -
            eclipseWindow.centralStart.getTime()) /
            1000,
        )
      : undefined;
  const summary = duration
    ? `${coverage}% of the Sun is covered at maximum at ${formatTime(eclipseWindow.peak)}. ${eclipseWindow.localType === "annular" ? "Annularity" : "Totality"} lasts ${Math.floor(duration / 60)}m ${String(duration % 60).padStart(2, "0")}s.`
    : `${coverage}% of the Sun is covered at maximum at ${formatTime(eclipseWindow.peak)}.`;
  const safety =
    eclipseWindow.localType === "total"
      ? "Use certified eclipse glasses until totality begins and as soon as it ends."
      : "Keep ISO 12312-2 compliant eclipse glasses on throughout the event; ordinary sunglasses are not safe.";
  if (!eclipseWindow.visible) {
    return {
      title: `No local view from ${location.label}`,
      summary: `This ${phase} does not rise above your horizon from the selected location.`,
      direction: directionDescription(
        maximumState.sun.azimuthDeg,
        maximumState.sun.altitudeDeg,
      ),
      coverage: "Not visible here",
      safety:
        "Choose a visible event and use certified eclipse glasses for every bright partial phase.",
    };
  }
  return {
    title,
    summary,
    direction: directionDescription(
      maximumState.sun.azimuthDeg,
      maximumState.sun.altitudeDeg,
    ),
    coverage: `${coverage}% covered at maximum`,
    safety,
  };
}
