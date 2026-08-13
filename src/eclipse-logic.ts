import * as Astronomy from "astronomy-engine";
import {
  ECLIPSE_CATALOG,
  ECLIPSE_CATALOG_METADATA,
  eclipseById,
  eclipseNearPeak,
} from "./eclipse-catalog";
import type {
  EclipseId,
  EclipseRecord,
  EclipseType,
  EclipseWindow,
  LocalEclipseResult,
  ObserverLocation,
  SkyState,
} from "./types";

export const DEFAULT_ECLIPSE_ID = "2026-08-12" as EclipseId;
const EVENT_MATCH_TOLERANCE_MS = 48 * 60 * 60 * 1000;
const EVENT_SEARCH_LEAD_MS = 48 * 60 * 60 * 1000;
const VISIBLE_SUN_ALTITUDE_DEG = -0.833;
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

function localTypeFor(kind: Astronomy.EclipseKind): EclipseWindow["localType"] {
  switch (kind) {
    case Astronomy.EclipseKind.Total:
      return "total";
    case Astronomy.EclipseKind.Annular:
      return "annular";
    default:
      return "partial";
  }
}

function phaseLabelFor(
  globalType: EclipseType,
  localType: EclipseWindow["localType"],
) {
  if (globalType === "hybrid") {
    return `Hybrid eclipse · locally ${localType}`;
  }
  return `${localType[0].toUpperCase()}${localType.slice(1)} eclipse`;
}

function sourceUrlFor(record: EclipseRecord) {
  return record.pathUrl ?? record.mapUrl;
}

function eventMatchesRecord(localPeak: Date, record: EclipseRecord): boolean {
  return eclipseNearPeak(localPeak, EVENT_MATCH_TOLERANCE_MS)?.id === record.id;
}

/** Astronomy Engine can return theoretical local events below the horizon. */
export function localEclipseIsAboveHorizon(
  eclipse: Astronomy.LocalSolarEclipseInfo,
) {
  return [
    eclipse.partial_begin,
    eclipse.total_begin,
    eclipse.peak,
    eclipse.total_end,
    eclipse.partial_end,
  ].some(
    (event) => event !== undefined && event.altitude > VISIBLE_SUN_ALTITUDE_DEG,
  );
}

function windowFromSearchResult(
  eclipse: Astronomy.LocalSolarEclipseInfo,
  record: EclipseRecord,
): EclipseWindow {
  const centralStart = eclipse.total_begin?.time.date;
  const centralEnd = eclipse.total_end?.time.date;
  const localType = localTypeFor(eclipse.kind);
  const isLocalTotal = localType === "total";
  return {
    eventId: record.id,
    globalType: record.type,
    localType,
    phaseLabel: phaseLabelFor(record.type, localType),
    start: eclipse.partial_begin.time.date,
    peak: eclipse.peak.time.date,
    end: eclipse.partial_end.time.date,
    centralStart,
    centralEnd,
    // Keep these aliases for the existing simulation and notification code.
    totalStart: isLocalTotal ? centralStart : undefined,
    totalEnd: isLocalTotal ? centralEnd : undefined,
    totalityDurationSeconds:
      isLocalTotal && centralStart && centralEnd
        ? (centralEnd.getTime() - centralStart.getTime()) / 1000
        : undefined,
    kind: eclipse.kind,
    peakObscuration: eclipse.obscuration,
    visible: true,
    sourceUrl: sourceUrlFor(record),
  };
}

/** Calculates one requested catalog event and never substitutes a later event. */
export function localEclipseFor(
  eventId: EclipseId,
  location: ObserverLocation,
): LocalEclipseResult {
  const record = eclipseById(eventId);
  if (!record) {
    throw new RangeError(`Unknown eclipse event: ${eventId}`);
  }
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const searchStart = new Date(
    new Date(record.peakUtc).getTime() - EVENT_SEARCH_LEAD_MS,
  );
  const eclipse = Astronomy.SearchLocalSolarEclipse(searchStart, observer);
  if (
    !eventMatchesRecord(eclipse.peak.time.date, record) ||
    !localEclipseIsAboveHorizon(eclipse)
  ) {
    return { visible: false, eventId, record, reason: "not-visible" };
  }
  return {
    visible: true,
    eventId,
    record,
    window: windowFromSearchResult(eclipse, record),
  };
}

/** Compatibility helper for views that require a visible event window. */
export function eclipseWindowFor(
  location: ObserverLocation,
  eventId: EclipseId = DEFAULT_ECLIPSE_ID,
): EclipseWindow {
  const result = localEclipseFor(eventId, location);
  if (!result.visible) {
    throw new RangeError(`${eventId} is not visible from ${location.label}`);
  }
  return result.window;
}

export function nextVisibleEclipse(
  location: ObserverLocation,
  from: Date = new Date(),
): LocalEclipseResult | undefined {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const catalogStart = new Date(
    `${ECLIPSE_CATALOG_METADATA.range.start}T00:00:00Z`,
  );
  const catalogEnd = new Date(
    `${ECLIPSE_CATALOG_METADATA.range.end}T23:59:59Z`,
  );
  const requestedSearchStart = new Date(from.getTime() - EVENT_SEARCH_LEAD_MS);
  const searchStart =
    requestedSearchStart > catalogStart ? requestedSearchStart : catalogStart;
  let eclipse = Astronomy.SearchLocalSolarEclipse(searchStart, observer);
  for (let count = 0; count < ECLIPSE_CATALOG.length * 2; count += 1) {
    if (eclipse.peak.time.date > catalogEnd) return undefined;
    const record = eclipseNearPeak(
      eclipse.peak.time.date,
      EVENT_MATCH_TOLERANCE_MS,
    );
    if (
      eclipse.partial_end.time.date >= from &&
      record &&
      localEclipseIsAboveHorizon(eclipse)
    ) {
      return {
        visible: true,
        eventId: record.id,
        record,
        window: windowFromSearchResult(eclipse, record),
      };
    }
    eclipse = Astronomy.NextLocalSolarEclipse(eclipse.peak.time, observer);
  }
  return undefined;
}

export function nextLocalTotalEclipse(
  location: ObserverLocation,
  from: Date = new Date(),
): LocalEclipseResult | undefined {
  for (const record of ECLIPSE_CATALOG) {
    if (
      new Date(record.peakUtc) < from ||
      (record.type !== "total" && record.type !== "hybrid")
    ) {
      continue;
    }
    const result = localEclipseFor(record.id, location);
    if (result.visible && result.window.localType === "total") return result;
  }
  return undefined;
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
  const observerVector = Astronomy.ObserverVector(time, observer, false);
  const topocentricDistance = (body: Astronomy.Body) => {
    const vector = Astronomy.GeoVector(body, time, true);
    return (
      Math.hypot(
        vector.x - observerVector.x,
        vector.y - observerVector.y,
        vector.z - observerVector.z,
      ) * Astronomy.KM_PER_AU
    );
  };
  const sunDistance = topocentricDistance(Astronomy.Body.Sun);
  const moonDistance = topocentricDistance(Astronomy.Body.Moon);
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
  const visible =
    inWindow && sun.altitudeDeg > VISIBLE_SUN_ALTITUDE_DEG && obscuration > 0;
  const central =
    visible &&
    !!eclipseWindow.centralStart &&
    !!eclipseWindow.centralEnd &&
    date >= eclipseWindow.centralStart &&
    date <= eclipseWindow.centralEnd;
  return {
    timestampUtc: date.toISOString(),
    sun,
    moon,
    eclipse: {
      visible,
      type: central ? eclipseWindow.localType : visible ? "partial" : "none",
      firstContact: eclipseWindow.start.toISOString(),
      secondContact: eclipseWindow.centralStart?.toISOString(),
      maximum: eclipseWindow.peak.toISOString(),
      thirdContact: eclipseWindow.centralEnd?.toISOString(),
      fourthContact: eclipseWindow.end.toISOString(),
      obscurationPercent: visible ? clamp(obscuration, 0, 100) : 0,
      magnitude: visible
        ? clamp((sunRadius + moonRadius - separation) / (sunRadius * 2), 0, 1.2)
        : 0,
    },
    twilightLevel: twilightForAltitude(sun.altitudeDeg),
  };
}
