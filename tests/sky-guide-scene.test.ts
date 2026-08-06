import { describe, expect, test } from "vitest";
import { eclipseWindowFor } from "../src/eclipse-logic";
import { eclipseEvents } from "../src/live-view";
import { angularSeparation } from "../src/sky-guide";
import { createSkyGuideScene } from "../src/sky-guide-scene";
import type { ObserverLocation } from "../src/types";

const location: ObserverLocation = {
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
};

const pathLength = (
  points: Array<{ azimuthDeg: number; altitudeDeg: number }>,
) =>
  points
    .slice(1)
    .reduce(
      (total, point, index) => total + angularSeparation(points[index], point),
      0,
    );

describe("all-sphere daily trajectories", () => {
  test("includes complete above- and below-horizon Sun and Moon paths", () => {
    const window = eclipseWindowFor(location);
    const events = eclipseEvents(window);
    const scene = createSkyGuideScene(
      window.peak,
      "Maximum eclipse",
      location,
      window,
      events,
    );

    for (const path of [scene.sunTrajectory, scene.moonTrajectory]) {
      expect(path.length).toBeGreaterThanOrEqual(145);
      expect(path.some((point) => point.altitudeDeg > 0)).toBe(true);
      expect(path.some((point) => point.altitudeDeg < 0)).toBe(true);
      expect(pathLength(path)).toBeGreaterThan(330);
      // The Moon changes declination during its apparent daily revolution, so
      // its real ephemeris forms a slight spiral rather than a perfect circle.
      expect(angularSeparation(path[0], path.at(-1)!)).toBeLessThan(8);
    }

    expect(
      scene.sunTrajectory
        .filter((point) => point.key)
        .map((point) => point.key),
    ).toEqual(events.map((event) => event.key));
    expect(scene.moonTrajectory.some((point) => point.key)).toBe(false);
  });

  test("centers live daily trajectories on the requested current time", () => {
    const window = eclipseWindowFor(location);
    const events = eclipseEvents(window);
    const currentTime = new Date("2026-08-06T12:00:00Z");
    const scene = createSkyGuideScene(
      currentTime,
      "Live now",
      location,
      window,
      events,
    );

    expect(scene.state.timestampUtc).toBe(currentTime.toISOString());
    expect(
      angularSeparation(scene.sunTrajectory[72], scene.state.sun),
    ).toBeLessThan(0.01);
    expect(
      angularSeparation(scene.moonTrajectory[72], scene.state.moon),
    ).toBeLessThan(0.01);
    expect(scene.sunTrajectory.some((point) => point.key)).toBe(false);
  });
});
