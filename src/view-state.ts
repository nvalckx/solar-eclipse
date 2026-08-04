import {
  isValidElevation,
  isValidLocation,
  isValidTimezone,
} from "./eclipse-logic";
import type { ObserverLocation, SharedView, SkyMode } from "./types";

export const LOCATION_STORAGE_KEY = "eclipse26-location";
const MAX_LABEL_LENGTH = 80;

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

export function parseSharedView(
  search: string,
  fallback: ObserverLocation,
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
  const parsedTime = params.get("time");
  const timestampMs = parsedTime ? Date.parse(parsedTime) : Number.NaN;
  const mode: SkyMode = params.get("mode") === "closeup" ? "closeup" : "sky";
  return {
    version: 1,
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
) {
  const url = new URL(base);
  url.search = "";
  url.searchParams.set("v", "1");
  url.searchParams.set("lat", location.latitude.toFixed(5));
  url.searchParams.set("lon", location.longitude.toFixed(5));
  if (location.elevationMeters)
    url.searchParams.set("elev", String(Math.round(location.elevationMeters)));
  url.searchParams.set("tz", location.timezone);
  url.searchParams.set("time", timestamp.toISOString());
  url.searchParams.set("label", location.label.slice(0, MAX_LABEL_LENGTH));
  url.searchParams.set("mode", mode);
  return url.toString();
}
