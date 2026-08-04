import * as Astronomy from "astronomy-engine";
import type { EclipseWindow, ObserverLocation, SkyState } from "./types";

const EVENT_SEARCH_START = new Date("2026-08-01T00:00:00Z");
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function isValidLocation(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isValidElevation(value: number) {
  return Number.isFinite(value) && value >= -500 && value <= 9000;
}

export function isValidTimezone(
  value: string | null | undefined,
): value is string {
  if (!value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function angularSeparation(
  a: { altitudeDeg: number; azimuthDeg: number },
  b: { altitudeDeg: number; azimuthDeg: number },
) {
  const alt1 = (a.altitudeDeg * Math.PI) / 180;
  const alt2 = (b.altitudeDeg * Math.PI) / 180;
  const az1 = (a.azimuthDeg * Math.PI) / 180;
  const az2 = (b.azimuthDeg * Math.PI) / 180;
  return (
    (Math.acos(
      clamp(
        Math.sin(alt1) * Math.sin(alt2) +
          Math.cos(alt1) * Math.cos(alt2) * Math.cos(az1 - az2),
        -1,
        1,
      ),
    ) *
      180) /
    Math.PI
  );
}

function angularDiameter(body: "Sun" | "Moon", distanceKm: number) {
  const radius = body === "Sun" ? 695700 : 1737.4;
  return (2 * Math.atan(radius / distanceKm) * 180) / Math.PI;
}

export function circleOverlapPercent(
  sunRadius: number,
  moonRadius: number,
  separation: number,
) {
  if (separation >= sunRadius + moonRadius) return 0;
  if (separation <= Math.abs(sunRadius - moonRadius)) {
    return moonRadius >= sunRadius
      ? 100
      : (moonRadius ** 2 / sunRadius ** 2) * 100;
  }
  const sunPart =
    sunRadius ** 2 *
    Math.acos(
      clamp(
        (separation ** 2 + sunRadius ** 2 - moonRadius ** 2) /
          (2 * separation * sunRadius),
        -1,
        1,
      ),
    );
  const moonPart =
    moonRadius ** 2 *
    Math.acos(
      clamp(
        (separation ** 2 + moonRadius ** 2 - sunRadius ** 2) /
          (2 * separation * moonRadius),
        -1,
        1,
      ),
    );
  const triangle =
    0.5 *
    Math.sqrt(
      Math.max(
        0,
        (-separation + sunRadius + moonRadius) *
          (separation + sunRadius - moonRadius) *
          (separation - sunRadius + moonRadius) *
          (separation + sunRadius + moonRadius),
      ),
    );
  return clamp(
    ((sunPart + moonPart - triangle) / (Math.PI * sunRadius ** 2)) * 100,
    0,
    100,
  );
}

function twilightForAltitude(altitude: number): SkyState["twilightLevel"] {
  if (altitude >= 0) return "day";
  if (altitude >= -6) return "civil";
  if (altitude >= -12) return "nautical";
  if (altitude >= -18) return "astronomical";
  return "night";
}

export function eclipseWindowFor(location: ObserverLocation): EclipseWindow {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const eclipse = Astronomy.SearchLocalSolarEclipse(
    EVENT_SEARCH_START,
    observer,
  );
  const totalStart = eclipse.total_begin?.time.date;
  const totalEnd = eclipse.total_end?.time.date;
  return {
    start: eclipse.partial_begin.time.date,
    peak: eclipse.peak.time.date,
    end: eclipse.partial_end.time.date,
    totalStart,
    totalEnd,
    totalityDurationSeconds:
      totalStart && totalEnd
        ? (totalEnd.getTime() - totalStart.getTime()) / 1000
        : undefined,
    kind: eclipse.kind,
    peakObscuration: eclipse.obscuration,
  };
}

export function calculateSkyState(
  date: Date,
  location: ObserverLocation,
  eclipseWindow: EclipseWindow,
): SkyState {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const time = new Astronomy.AstroTime(date);
  const sunEquator = Astronomy.Equator(
    Astronomy.Body.Sun,
    time,
    observer,
    true,
    true,
  );
  const moonEquator = Astronomy.Equator(
    Astronomy.Body.Moon,
    time,
    observer,
    true,
    true,
  );
  const sunHorizon = Astronomy.Horizon(
    time,
    observer,
    sunEquator.ra,
    sunEquator.dec,
    "normal",
  );
  const moonHorizon = Astronomy.Horizon(
    time,
    observer,
    moonEquator.ra,
    moonEquator.dec,
    "normal",
  );
  const sunVector = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
  const moonVector = Astronomy.GeoVector(Astronomy.Body.Moon, time, true);
  const vectorDistance = (vector: Astronomy.Vector) =>
    Math.hypot(vector.x, vector.y, vector.z) * Astronomy.KM_PER_AU;
  const sunDistance = vectorDistance(sunVector);
  const moonDistance = vectorDistance(moonVector);
  const sun = {
    azimuthDeg: sunHorizon.azimuth,
    altitudeDeg: sunHorizon.altitude,
    angularDiameterDeg: angularDiameter("Sun", sunDistance),
    distanceKm: sunDistance,
  };
  const moon = {
    azimuthDeg: moonHorizon.azimuth,
    altitudeDeg: moonHorizon.altitude,
    angularDiameterDeg: angularDiameter("Moon", moonDistance),
    distanceKm: moonDistance,
  };
  const separation = angularSeparation(sun, moon);
  const sunRadius = sun.angularDiameterDeg / 2;
  const moonRadius = moon.angularDiameterDeg / 2;
  const obscuration = circleOverlapPercent(sunRadius, moonRadius, separation);
  const inWindow = date >= eclipseWindow.start && date <= eclipseWindow.end;
  const visible = inWindow && sun.altitudeDeg > -0.833 && obscuration > 0;
  const total =
    visible &&
    eclipseWindow.kind === Astronomy.EclipseKind.Total &&
    !!eclipseWindow.totalStart &&
    !!eclipseWindow.totalEnd &&
    date >= eclipseWindow.totalStart &&
    date <= eclipseWindow.totalEnd;
  return {
    timestampUtc: date.toISOString(),
    sun,
    moon,
    eclipse: {
      visible,
      type: total ? "total" : visible ? "partial" : "none",
      firstContact: eclipseWindow.start.toISOString(),
      secondContact: eclipseWindow.totalStart?.toISOString(),
      maximum: eclipseWindow.peak.toISOString(),
      thirdContact: eclipseWindow.totalEnd?.toISOString(),
      fourthContact: eclipseWindow.end.toISOString(),
      obscurationPercent: visible ? clamp(obscuration, 0, 100) : 0,
      magnitude: visible
        ? clamp((sunRadius + moonRadius - separation) / (sunRadius * 2), 0, 1.2)
        : 0,
    },
    twilightLevel: twilightForAltitude(sun.altitudeDeg),
  };
}
