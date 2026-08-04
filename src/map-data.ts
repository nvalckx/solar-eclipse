import { NATURAL_EARTH_LAND_PATH } from "./generated-land-path";

export type Coordinate = readonly [longitude: number, latitude: number];
export type TimedPathPoint = { timeUtc: string; coordinate: Coordinate };
export type TimedPathFrame = {
  timeUtc: string;
  timestampMs: number;
  north: Coordinate;
  south: Coordinate;
  center: Coordinate;
};

export type PathShadowState = {
  timestampMs: number;
  timeUtc: string;
  north: Coordinate;
  south: Coordinate;
  center: Coordinate;
  widthKm: number;
  radiusKm: number;
};

const point = (
  latDegrees: number,
  latMinutes: number,
  lonDegrees: number,
  lonMinutes: number,
  direction: "E" | "W",
): Coordinate => [
  (lonDegrees + lonMinutes / 60) * (direction === "E" ? 1 : -1),
  latDegrees + latMinutes / 60,
];

type Row = {
  timeUtc: string;
  north?: Coordinate;
  south: Coordinate;
  center: Coordinate;
};

// WGS84 coordinates transcribed from Fred Espenak's NASA GSFC 2026-08-12
// path table. Rows are sampled every two minutes, matching the source table.
const ROWS: Row[] = [
  {
    timeUtc: "17:02",
    north: point(75, 56.2, 108, 45.5, "E"),
    south: point(85, 19.3, 119, 25.4, "E"),
    center: point(82, 16.5, 112, 29.2, "E"),
  },
  {
    timeUtc: "17:04",
    north: point(82, 9.8, 103, 13, "E"),
    south: point(87, 45.2, 108, 25.9, "E"),
    center: point(85, 17.7, 104, 12.9, "E"),
  },
  {
    timeUtc: "17:06",
    north: point(84, 51, 90, 23.7, "E"),
    south: point(89, 4, 38, 8.9, "E"),
    center: point(87, 16.7, 81, 31.5, "E"),
  },
  {
    timeUtc: "17:08",
    north: point(86, 20.6, 65, 49.4, "E"),
    south: point(87, 47.3, 19, 30.4, "W"),
    center: point(87, 49.4, 33, 0, "E"),
  },
  {
    timeUtc: "17:10",
    north: point(86, 32.7, 32, 43.7, "E"),
    south: point(86, 8.5, 29, 13, "W"),
    center: point(86, 50.1, 1, 38.3, "W"),
  },
  {
    timeUtc: "17:12",
    north: point(85, 43.2, 8, 22.5, "E"),
    south: point(84, 33.9, 32, 14.8, "W"),
    center: point(85, 24.2, 15, 10.9, "W"),
  },
  {
    timeUtc: "17:14",
    north: point(84, 28.9, 4, 48.6, "W"),
    south: point(83, 4.3, 33, 25, "W"),
    center: point(83, 55.9, 21, 11.2, "W"),
  },
  {
    timeUtc: "17:16",
    north: point(83, 7.9, 12, 0.1, "W"),
    south: point(81, 39, 33, 50.3, "W"),
    center: point(82, 29.7, 24, 16.3, "W"),
  },
  {
    timeUtc: "17:18",
    north: point(81, 46.5, 16, 13, "W"),
    south: point(80, 17.5, 33, 53.8, "W"),
    center: point(81, 6.6, 25, 59.5, "W"),
  },
  {
    timeUtc: "17:20",
    north: point(80, 26.5, 18, 50.5, "W"),
    south: point(78, 59.2, 33, 45.6, "W"),
    center: point(79, 46.4, 26, 58.9, "W"),
  },
  {
    timeUtc: "17:22",
    north: point(79, 8.5, 20, 32.3, "W"),
    south: point(77, 43.6, 33, 30.3, "W"),
    center: point(78, 29, 27, 32.4, "W"),
  },
  {
    timeUtc: "17:24",
    north: point(77, 52.5, 21, 39.4, "W"),
    south: point(76, 30.4, 33, 10.7, "W"),
    center: point(77, 14, 27, 49.5, "W"),
  },
  {
    timeUtc: "17:26",
    north: point(76, 38.5, 22, 23.6, "W"),
    south: point(75, 19.4, 32, 48.3, "W"),
    center: point(76, 1.1, 27, 55.7, "W"),
  },
  {
    timeUtc: "17:28",
    north: point(75, 26.4, 22, 51.9, "W"),
    south: point(74, 10.1, 32, 24, "W"),
    center: point(74, 50.2, 27, 54.3, "W"),
  },
  {
    timeUtc: "17:30",
    north: point(74, 16, 23, 8.7, "W"),
    south: point(73, 2.6, 31, 58.3, "W"),
    center: point(73, 41, 27, 47.3, "W"),
  },
  {
    timeUtc: "17:32",
    north: point(73, 7, 23, 17.1, "W"),
    south: point(71, 56.4, 31, 31.6, "W"),
    center: point(72, 33.4, 27, 36.2, "W"),
  },
  {
    timeUtc: "17:34",
    north: point(71, 59.5, 23, 18.8, "W"),
    south: point(70, 51.6, 31, 4.1, "W"),
    center: point(71, 27, 27, 21.7, "W"),
  },
  {
    timeUtc: "17:36",
    north: point(70, 53.1, 23, 15.5, "W"),
    south: point(69, 47.8, 30, 36, "W"),
    center: point(70, 21.9, 27, 4.7, "W"),
  },
  {
    timeUtc: "17:38",
    north: point(69, 47.9, 23, 7.9, "W"),
    south: point(68, 45.2, 30, 7.2, "W"),
    center: point(69, 17.9, 26, 45.6, "W"),
  },
  {
    timeUtc: "17:40",
    north: point(68, 43.6, 22, 56.9, "W"),
    south: point(67, 43.4, 29, 37.9, "W"),
    center: point(68, 14.8, 26, 24.6, "W"),
  },
  {
    timeUtc: "17:42",
    north: point(67, 40.2, 22, 42.8, "W"),
    south: point(66, 42.4, 29, 8, "W"),
    center: point(67, 12.6, 26, 1.9, "W"),
  },
  {
    timeUtc: "17:44",
    north: point(66, 37.6, 22, 26.2, "W"),
    south: point(65, 42.2, 28, 37.5, "W"),
    center: point(66, 11.1, 25, 37.8, "W"),
  },
  {
    timeUtc: "17:46",
    north: point(65, 35.6, 22, 7.2, "W"),
    south: point(64, 42.6, 28, 6.4, "W"),
    center: point(65, 10.3, 25, 12.3, "W"),
  },
  {
    timeUtc: "17:48",
    north: point(64, 34.3, 21, 46.1, "W"),
    south: point(63, 43.6, 27, 34.6, "W"),
    center: point(64, 10.1, 24, 45.4, "W"),
  },
  {
    timeUtc: "17:50",
    north: point(63, 33.4, 21, 22.9, "W"),
    south: point(62, 45, 27, 2, "W"),
    center: point(63, 10.3, 24, 17.2, "W"),
  },
  {
    timeUtc: "17:52",
    north: point(62, 32.9, 20, 57.7, "W"),
    south: point(61, 46.8, 26, 28.6, "W"),
    center: point(62, 11, 23, 47.6, "W"),
  },
  {
    timeUtc: "17:54",
    north: point(61, 32.8, 20, 30.5, "W"),
    south: point(60, 49, 25, 54.3, "W"),
    center: point(61, 12, 23, 16.6, "W"),
  },
  {
    timeUtc: "17:56",
    north: point(60, 32.9, 20, 1.3, "W"),
    south: point(59, 51.4, 25, 19, "W"),
    center: point(60, 13.3, 22, 44.2, "W"),
  },
  {
    timeUtc: "17:58",
    north: point(59, 33.2, 19, 30, "W"),
    south: point(58, 54, 24, 42.4, "W"),
    center: point(59, 14.7, 22, 10.2, "W"),
  },
  {
    timeUtc: "18:00",
    north: point(58, 33.6, 18, 56.6, "W"),
    south: point(57, 56.7, 24, 4.6, "W"),
    center: point(58, 16.3, 21, 34.4, "W"),
  },
  {
    timeUtc: "18:02",
    north: point(57, 33.9, 18, 20.9, "W"),
    south: point(56, 59.4, 23, 25.3, "W"),
    center: point(57, 17.8, 20, 56.8, "W"),
  },
  {
    timeUtc: "18:04",
    north: point(56, 34.1, 17, 42.7, "W"),
    south: point(56, 2.2, 22, 44.3, "W"),
    center: point(56, 19.3, 20, 17.2, "W"),
  },
  {
    timeUtc: "18:06",
    north: point(55, 34.1, 17, 1.7, "W"),
    south: point(55, 4.7, 22, 1.5, "W"),
    center: point(55, 20.6, 19, 35.3, "W"),
  },
  {
    timeUtc: "18:08",
    north: point(54, 33.7, 16, 17.7, "W"),
    south: point(54, 7.1, 21, 16.5, "W"),
    center: point(54, 21.7, 18, 50.8, "W"),
  },
  {
    timeUtc: "18:10",
    north: point(53, 32.8, 15, 30.2, "W"),
    south: point(53, 9.1, 20, 29.1, "W"),
    center: point(53, 22.3, 18, 3.4, "W"),
  },
  {
    timeUtc: "18:12",
    north: point(52, 31.2, 14, 38.8, "W"),
    south: point(52, 10.6, 19, 38.8, "W"),
    center: point(52, 22.3, 17, 12.7, "W"),
  },
  {
    timeUtc: "18:14",
    north: point(51, 28.7, 13, 42.7, "W"),
    south: point(51, 11.6, 18, 45.3, "W"),
    center: point(51, 21.6, 16, 18.2, "W"),
  },
  {
    timeUtc: "18:16",
    north: point(50, 25, 12, 41.1, "W"),
    south: point(50, 11.7, 17, 47.9, "W"),
    center: point(50, 20, 15, 19, "W"),
  },
  {
    timeUtc: "18:18",
    north: point(49, 19.8, 11, 32.8, "W"),
    south: point(49, 10.9, 16, 45.9, "W"),
    center: point(49, 17.1, 14, 14.3, "W"),
  },
  {
    timeUtc: "18:20",
    north: point(48, 12.5, 10, 16, "W"),
    south: point(48, 8.8, 15, 38.3, "W"),
    center: point(48, 12.7, 13, 2.9, "W"),
  },
  {
    timeUtc: "18:22",
    north: point(47, 2.3, 8, 48.1, "W"),
    south: point(47, 5, 14, 23.8, "W"),
    center: point(47, 6.1, 11, 42.9, "W"),
  },
  {
    timeUtc: "18:24",
    north: point(45, 48.1, 7, 4.6, "W"),
    south: point(45, 59, 13, 0.5, "W"),
    center: point(45, 56.6, 10, 11.4, "W"),
  },
  {
    timeUtc: "18:26",
    north: point(44, 27.4, 4, 56.9, "W"),
    south: point(44, 49.9, 11, 25.2, "W"),
    center: point(44, 42.8, 8, 23.9, "W"),
  },
  {
    timeUtc: "18:28",
    north: point(42, 54.5, 2, 5.1, "W"),
    south: point(43, 36.4, 9, 33.1, "W"),
    center: point(43, 22.3, 6, 11.3, "W"),
  },
  {
    timeUtc: "18:30",
    north: point(40, 39.9, 3, 17.7, "E"),
    south: point(42, 15.8, 7, 14.2, "W"),
    center: point(41, 49, 3, 11.1, "W"),
  },
  {
    timeUtc: "18:32",
    south: point(40, 41, 4, 2.4, "W"),
    center: point(39, 24.5, 2, 57, "E"),
  },
];

const START_NORTH = point(75, 10.4, 108, 41.4, "E");
const START_SOUTH = point(74, 54.8, 117, 57.6, "E");
const END_NORTH = point(39, 42.5, 6, 20.4, "E");
const END_SOUTH = point(37, 41.4, 4, 32.4, "E");

export const LAND_PATH = NATURAL_EARTH_LAND_PATH;
export const TOTALITY_NORTH: Coordinate[] = [
  START_NORTH,
  ...ROWS.flatMap((row) => (row.north ? [row.north] : [])),
  END_NORTH,
];
export const TOTALITY_SOUTH: Coordinate[] = [
  START_SOUTH,
  ...ROWS.map((row) => row.south),
  END_SOUTH,
];
export const TOTALITY_CENTERLINE: TimedPathPoint[] = ROWS.map((row) => ({
  timeUtc: row.timeUtc,
  coordinate: row.center,
}));
export const TOTALITY_BAND: Coordinate[] = [
  ...TOTALITY_NORTH,
  ...[...TOTALITY_SOUTH].reverse(),
];

const PATH_DATE = "2026-08-12";
const pathTimestamp = (timeUtc: string) =>
  Date.parse(`${PATH_DATE}T${timeUtc}:00Z`);

export const TOTALITY_FRAMES: TimedPathFrame[] = ROWS.map((row) => ({
  timeUtc: row.timeUtc,
  timestampMs: pathTimestamp(row.timeUtc),
  north: row.north ?? END_NORTH,
  south: row.south,
  center: row.center,
}));

export const PATH_START_MS = TOTALITY_FRAMES[0].timestampMs;
export const PATH_END_MS =
  TOTALITY_FRAMES[TOTALITY_FRAMES.length - 1].timestampMs;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceKm = (a: Coordinate, b: Coordinate) => {
  const latitudeA = toRadians(a[1]);
  const latitudeB = toRadians(b[1]);
  const deltaLatitude = latitudeB - latitudeA;
  const longitudeDelta = ((b[0] - a[0] + 540) % 360) - 180;
  const deltaLongitude = toRadians(longitudeDelta);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) *
      Math.cos(latitudeB) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
};

export const interpolateCoordinate = (
  from: Coordinate,
  to: Coordinate,
  progress: number,
): Coordinate => {
  const longitudeDelta = ((to[0] - from[0] + 540) % 360) - 180;
  return [
    from[0] + longitudeDelta * progress,
    from[1] + (to[1] - from[1]) * progress,
  ];
};

export function pathShadowAt(timestampMs: number): PathShadowState {
  const clamped = Math.min(PATH_END_MS, Math.max(PATH_START_MS, timestampMs));
  let index = TOTALITY_FRAMES.findIndex(
    (frame, frameIndex) =>
      clamped >= frame.timestampMs &&
      (TOTALITY_FRAMES[frameIndex + 1]?.timestampMs ?? Infinity) >= clamped,
  );
  if (index < 0) index = TOTALITY_FRAMES.length - 1;

  const from = TOTALITY_FRAMES[index];
  const to = TOTALITY_FRAMES[index + 1] ?? from;
  const duration = to.timestampMs - from.timestampMs;
  const progress = duration ? (clamped - from.timestampMs) / duration : 0;
  const north = interpolateCoordinate(from.north, to.north, progress);
  const south = interpolateCoordinate(from.south, to.south, progress);
  const center = interpolateCoordinate(from.center, to.center, progress);
  const widthKm = distanceKm(north, south);

  return {
    timestampMs: clamped,
    timeUtc: new Date(clamped).toISOString().slice(11, 16),
    north,
    south,
    center,
    widthKm,
    radiusKm: widthKm / 2,
  };
}

export const MAP_SOURCE = {
  path: "Eclipse Predictions by Fred Espenak, NASA’s GSFC",
  pathUrl:
    "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html",
  land: "Natural Earth 1:110m land, via world-atlas 2.0.2",
  landUrl: "https://www.naturalearthdata.com/downloads/110m-physical-vectors/",
} as const;
