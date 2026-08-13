import type { ObserverLocation } from "./types";
import { CITY_CATALOG } from "./city-catalog";

type PlaceRecord = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  population: number;
};

export async function searchPlaces(
  query: string,
  limit = 12,
): Promise<ObserverLocation[]> {
  const normalized = query.trim().toLocaleLowerCase();
  const { default: places } = await import("./generated-place-catalog.json");
  const generated = (places as PlaceRecord[])
    .filter(
      (place) =>
        !normalized || place.label.toLocaleLowerCase().includes(normalized),
    )
    .map((place) => ({
      latitude: place.latitude,
      longitude: place.longitude,
      elevationMeters: 0,
      label: place.label,
      timezone: place.timezone,
      source: "preset" as const,
    }));
  const curated = CITY_CATALOG.filter(
    (place) =>
      !normalized || place.label.toLocaleLowerCase().includes(normalized),
  );
  return [...curated, ...generated]
    .filter(
      (place, index, all) =>
        all.findIndex((candidate) => candidate.label === place.label) === index,
    )
    .slice(0, limit);
}

export async function timezoneAt(latitude: number, longitude: number) {
  const { default: lookup } = await import("tz-lookup");
  return lookup(latitude, longitude);
}
