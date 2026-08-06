import * as Astronomy from "astronomy-engine";
import { calculateSkyState } from "./eclipse-logic";
import type { EclipseWindow, ObserverLocation, SkyState } from "./types";
import type { SphericalDirection } from "./sky-guide";

export type SkyGuideStar = SphericalDirection & {
  name: string;
  magnitude: number;
};

export type SkyGuideTrajectoryPoint = SphericalDirection & {
  key?: string;
  label?: string;
};

export type SkyGuideScene = {
  state: SkyState;
  target: SphericalDirection;
  targetLabel: string;
  targetObservable: boolean;
  stars: SkyGuideStar[];
  sunTrajectory: SkyGuideTrajectoryPoint[];
  moonTrajectory: SkyGuideTrajectoryPoint[];
};

const SUN_APPARENT_REVOLUTION_MS = 24 * 60 * 60 * 1000;
const MOON_APPARENT_REVOLUTION_MS = (24 * 60 + 50) * 60 * 1000;
const TRAJECTORY_SEGMENTS = 144;

// J2000 coordinates for a compact selection of the brightest named stars.
// Values are from the public-domain Yale Bright Star Catalogue, 5th edition.
const BRIGHT_STARS = [
  ["Sirius", 6.7525, -16.7161, -1.46],
  ["Canopus", 6.3992, -52.6957, -0.74],
  ["Arcturus", 14.261, 19.1824, -0.05],
  ["Vega", 18.6156, 38.7837, 0.03],
  ["Capella", 5.2782, 45.998, 0.08],
  ["Rigel", 5.2423, -8.2016, 0.13],
  ["Procyon", 7.655, 5.225, 0.34],
  ["Achernar", 1.6286, -57.2368, 0.46],
  ["Betelgeuse", 5.9195, 7.4071, 0.5],
  ["Hadar", 14.0637, -60.373, 0.61],
  ["Altair", 19.8464, 8.8683, 0.76],
  ["Acrux", 12.4433, -63.0991, 0.77],
  ["Aldebaran", 4.5987, 16.5093, 0.85],
  ["Antares", 16.4901, -26.432, 0.96],
  ["Spica", 13.4199, -11.1614, 0.98],
  ["Pollux", 7.7553, 28.0262, 1.14],
  ["Fomalhaut", 22.9608, -29.6222, 1.16],
  ["Deneb", 20.6905, 45.2803, 1.25],
  ["Regulus", 10.1395, 11.9672, 1.35],
  ["Castor", 7.5767, 31.8883, 1.58],
  ["Shaula", 17.5601, -37.1038, 1.62],
  ["Bellatrix", 5.4189, 6.3497, 1.64],
  ["Elnath", 5.4382, 28.6075, 1.65],
  ["Alnilam", 5.6036, -1.2019, 1.69],
  ["Alioth", 12.9005, 55.9598, 1.76],
  ["Dubhe", 11.0621, 61.7508, 1.79],
] as const;

function starPositions(date: Date, location: ObserverLocation): SkyGuideStar[] {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const time = new Astronomy.AstroTime(date);
  return BRIGHT_STARS.map(([name, rightAscension, declination, magnitude]) => {
    const horizon = Astronomy.Horizon(
      time,
      observer,
      rightAscension,
      declination,
      "normal",
    );
    return {
      name,
      magnitude,
      azimuthDeg: horizon.azimuth,
      altitudeDeg: horizon.altitude,
    };
  });
}

function bodyTrajectory(
  body: Astronomy.Body,
  centerTime: Date,
  observer: Astronomy.Observer,
  revolutionMs: number,
  eventByTime?: ReadonlyMap<number, { key: string; label: string; time: Date }>,
): SkyGuideTrajectoryPoint[] {
  const start = centerTime.getTime() - revolutionMs / 2;
  const end = start + revolutionMs;
  const sampleTimes = Array.from(
    { length: TRAJECTORY_SEGMENTS + 1 },
    (_, index) =>
      Math.round(start + (revolutionMs * index) / TRAJECTORY_SEGMENTS),
  );
  eventByTime?.forEach((event) => {
    const eventTime = event.time.getTime();
    if (eventTime >= start && eventTime <= end) sampleTimes.push(eventTime);
  });

  return [...new Set(sampleTimes)]
    .sort((left, right) => left - right)
    .map((timestamp) => {
      const time = new Astronomy.AstroTime(new Date(timestamp));
      const equator = Astronomy.Equator(body, time, observer, true, true);
      const horizon = Astronomy.Horizon(
        time,
        observer,
        equator.ra,
        equator.dec,
        "normal",
      );
      const event = eventByTime?.get(timestamp);
      return {
        azimuthDeg: horizon.azimuth,
        altitudeDeg: horizon.altitude,
        key: event?.key,
        label: event?.label,
      };
    });
}

export function createSkyGuideScene(
  targetTime: Date,
  targetLabel: string,
  location: ObserverLocation,
  window: EclipseWindow,
  events: Array<{ key: string; label: string; time: Date }>,
): SkyGuideScene {
  const state = calculateSkyState(targetTime, location, window);
  const eventByTime = new Map(
    events.map((event) => [event.time.getTime(), event] as const),
  );
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    location.elevationMeters,
  );
  const sunTrajectory = bodyTrajectory(
    Astronomy.Body.Sun,
    targetTime,
    observer,
    SUN_APPARENT_REVOLUTION_MS,
    eventByTime,
  );
  const moonTrajectory = bodyTrajectory(
    Astronomy.Body.Moon,
    targetTime,
    observer,
    MOON_APPARENT_REVOLUTION_MS,
  );
  return {
    state,
    target: state.sun,
    targetLabel,
    targetObservable: state.sun.altitudeDeg > -0.833,
    stars: starPositions(targetTime, location),
    sunTrajectory,
    moonTrajectory,
  };
}
