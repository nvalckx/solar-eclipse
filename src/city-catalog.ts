import type { ObserverLocation } from "./types";

const CITIES: Array<Omit<ObserverLocation, "source">> = [
  {
    latitude: 41.65,
    longitude: -0.89,
    elevationMeters: 250,
    label: "Zaragoza, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 64.15,
    longitude: -21.94,
    elevationMeters: 20,
    label: "Reykjavík, Iceland",
    timezone: "Atlantic/Reykjavik",
  },
  {
    latitude: 55.68,
    longitude: 12.57,
    elevationMeters: 10,
    label: "Copenhagen, Denmark",
    timezone: "Europe/Copenhagen",
  },
  {
    latitude: 52.37,
    longitude: 4.9,
    elevationMeters: 2,
    label: "Amsterdam, Netherlands",
    timezone: "Europe/Amsterdam",
  },
  {
    latitude: 51.7755,
    longitude: 5.8757,
    elevationMeters: 10,
    label: "Pitch&Putt Molenhoek",
    timezone: "Europe/Amsterdam",
  },
  {
    latitude: 40.42,
    longitude: -3.7,
    elevationMeters: 650,
    label: "Madrid, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 43.36,
    longitude: -8.41,
    elevationMeters: 30,
    label: "A Coruña, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 43.26,
    longitude: -2.93,
    elevationMeters: 10,
    label: "Bilbao, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 42.14,
    longitude: -0.41,
    elevationMeters: 480,
    label: "Huesca, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 41.38,
    longitude: 2.17,
    elevationMeters: 12,
    label: "Barcelona, Spain",
    timezone: "Europe/Madrid",
  },
  {
    latitude: 38.72,
    longitude: -9.14,
    elevationMeters: 20,
    label: "Lisbon, Portugal",
    timezone: "Europe/Lisbon",
  },
  {
    latitude: 51.92,
    longitude: 4.48,
    elevationMeters: 0,
    label: "Rotterdam, Netherlands",
    timezone: "Europe/Amsterdam",
  },
  {
    latitude: 52.52,
    longitude: 13.41,
    elevationMeters: 34,
    label: "Berlin, Germany",
    timezone: "Europe/Berlin",
  },
  {
    latitude: 48.86,
    longitude: 2.35,
    elevationMeters: 35,
    label: "Paris, France",
    timezone: "Europe/Paris",
  },
  {
    latitude: 53.55,
    longitude: 9.99,
    elevationMeters: 8,
    label: "Hamburg, Germany",
    timezone: "Europe/Berlin",
  },
  {
    latitude: 55.95,
    longitude: -3.19,
    elevationMeters: 47,
    label: "Edinburgh, United Kingdom",
    timezone: "Europe/London",
  },
  {
    latitude: 51.51,
    longitude: -0.13,
    elevationMeters: 11,
    label: "London, United Kingdom",
    timezone: "Europe/London",
  },
  {
    latitude: 59.91,
    longitude: 10.75,
    elevationMeters: 23,
    label: "Oslo, Norway",
    timezone: "Europe/Oslo",
  },
  {
    latitude: 59.33,
    longitude: 18.07,
    elevationMeters: 28,
    label: "Stockholm, Sweden",
    timezone: "Europe/Stockholm",
  },
  {
    latitude: 60.17,
    longitude: 24.94,
    elevationMeters: 25,
    label: "Helsinki, Finland",
    timezone: "Europe/Helsinki",
  },
  {
    latitude: 62.01,
    longitude: 129.73,
    elevationMeters: 100,
    label: "Yakutsk, Russia",
    timezone: "Asia/Yakutsk",
  },
];

export const CITY_CATALOG: ObserverLocation[] = CITIES.map((city) => ({
  ...city,
  source: "preset",
}));

export const DEFAULT_CITY =
  CITY_CATALOG.find((city) => city.label === "Amsterdam, Netherlands") ??
  CITY_CATALOG[0];
