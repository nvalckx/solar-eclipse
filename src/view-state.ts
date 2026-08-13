import {
  isValidElevation,
  isValidLocation,
  isValidTimezone,
} from "./eclipse-logic";
import type { EclipseId, ObserverLocation, SharedView, SkyMode } from "./types";

export const LOCATION_STORAGE_KEY = "eclipse26-location";
export const SELECTED_ECLIPSE_STORAGE_KEY =
  "eclipse-companion-selected-eclipse";
export const LEGACY_ECLIPSE_ID: EclipseId = "2026-08-12";
const MAX_LABEL_LENGTH = 80;

export function isEclipseId(value: unknown): value is EclipseId {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function sanitizeLabel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_LABEL_LENGTH)
    : fallback;
}

function normalizeLocation(
  value: Record<string, unknown>,
  legacy = false,
): ObserverLocation | null {
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const elevation = Number(value.elevationMeters ?? 0);
  if (
    !isValidLocation(latitude, longitude) ||
    !isValidElevation(elevation) ||
    !isValidTimezone(String(value.timezone ?? ""))
  )
    return null;
  const source = value.source;
  return {
    latitude,
    longitude,
    elevationMeters: elevation,
    timezone: String(value.timezone),
    label: sanitizeLabel(
      value.label,
      legacy ? "Saved location" : "Selected location",
    ),
    source:
      source === "preset" ||
      source === "geolocation" ||
      source === "coordinates"
        ? source
        : "coordinates",
  };
}

export function parseStoredLocation(
  raw: string | null,
): ObserverLocation | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (
      value.version === 1 &&
      value.location &&
      typeof value.location === "object"
    ) {
      return normalizeLocation(value.location as Record<string, unknown>);
    }
    return normalizeLocation(value, true);
  } catch {
    return null;
  }
}

export function serializeStoredLocation(location: ObserverLocation) {
  return JSON.stringify({ version: 1, location });
}

export function parseStoredEclipseId(raw: string | null): EclipseId | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isEclipseId(parsed)) return parsed;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    return value.version === 1 && isEclipseId(value.eclipseId)
      ? value.eclipseId
      : null;
  } catch {
    return null;
  }
}

export function serializeStoredEclipseId(eclipseId: EclipseId) {
  return JSON.stringify({ version: 1, eclipseId });
}

export function parseSharedView(
  search: string,
  fallback: ObserverLocation,
  fallbackEclipseId: EclipseId = LEGACY_ECLIPSE_ID,
): SharedView {
  const params = new URLSearchParams(search);
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  const elevation = Number(params.get("elev") ?? 0);
  const timezone = params.get("tz");
  const hasCoordinates = params.has("lat") && params.has("lon");
  const location =
    hasCoordinates &&
    isValidLocation(latitude, longitude) &&
    isValidElevation(elevation) &&
    isValidTimezone(timezone)
      ? {
          latitude,
          longitude,
          elevationMeters: elevation,
          timezone,
          label: sanitizeLabel(params.get("label"), "Shared location"),
          source: "coordinates" as const,
        }
      : fallback;
  const requestedEclipseId = params.get("eclipse");
  const isVersionTwo = params.get("v") === "2" || requestedEclipseId !== null;
  const parsedTime = params.get("t") ?? params.get("time");
  const timestampMs = parsedTime ? Date.parse(parsedTime) : Number.NaN;
  const mode: SkyMode = params.get("mode") === "closeup" ? "closeup" : "sky";
  return {
    version: isVersionTwo ? 2 : 1,
    eclipseId: isEclipseId(requestedEclipseId)
      ? requestedEclipseId
      : isVersionTwo
        ? fallbackEclipseId
        : undefined,
    location,
    timestamp: Number.isFinite(timestampMs) ? new Date(timestampMs) : undefined,
    mode,
  };
}

export function buildShareUrl(
  base: string,
  location: ObserverLocation,
  timestamp: Date,
  mode: SkyMode,
  eclipseId: EclipseId = LEGACY_ECLIPSE_ID,
) {
  const url = new URL(base);
  url.search = "";
  url.searchParams.set("v", "2");
  url.searchParams.set("eclipse", eclipseId);
  url.searchParams.set("lat", location.latitude.toFixed(5));
  url.searchParams.set("lon", location.longitude.toFixed(5));
  if (location.elevationMeters)
    url.searchParams.set("elev", String(Math.round(location.elevationMeters)));
  url.searchParams.set("tz", location.timezone);
  url.searchParams.set("t", timestamp.toISOString());
  url.searchParams.set("label", location.label.slice(0, MAX_LABEL_LENGTH));
  url.searchParams.set("mode", mode);
  return url.toString();
}
