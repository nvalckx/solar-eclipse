import { describe, expect, test } from "vitest";
import {
  CELESTIAL_DISK_ENLARGEMENT,
  angularSeparation,
  canonicalizeDirection,
  directionVector,
  dragSkyView,
  projectDirection,
  projectedAngularRadius,
  zoomSkyView,
  type SkyViewState,
} from "../src/sky-guide";

const northView: SkyViewState = {
  azimuthDeg: 0,
  altitudeDeg: 0,
  rollDeg: 0,
  fovDeg: 60,
};

describe("all-sphere sky projection", () => {
  test("maps cardinal and vertical directions into local ENU vectors", () => {
    expect(directionVector({ azimuthDeg: 0, altitudeDeg: 0 })).toEqual([
      0, 1, 0,
    ]);
    expect(directionVector({ azimuthDeg: 90, altitudeDeg: 0 })[0]).toBeCloseTo(
      1,
      8,
    );
    expect(directionVector({ azimuthDeg: 0, altitudeDeg: 90 })[2]).toBeCloseTo(
      1,
      8,
    );
  });

  test("projects the view center and clips the opposite hemisphere", () => {
    expect(
      projectDirection({ azimuthDeg: 0, altitudeDeg: 0 }, northView, 800, 400),
    ).toMatchObject({ x: 400, y: 200, visible: true });
    expect(
      projectDirection({ azimuthDeg: 180, altitudeDeg: 0 }, northView, 800, 400)
        .visible,
    ).toBe(false);
  });

  test("crosses zenith and nadir without dead ends", () => {
    expect(canonicalizeDirection(10, 100)).toEqual({
      azimuthDeg: 190,
      altitudeDeg: 80,
    });
    expect(canonicalizeDirection(10, -100)).toEqual({
      azimuthDeg: 190,
      altitudeDeg: -80,
    });
    const crossed = dragSkyView(
      { ...northView, azimuthDeg: 10, altitudeDeg: 85 },
      0,
      20,
      100,
    );
    expect(crossed.altitudeDeg).toBeLessThan(90);
    expect(crossed.azimuthDeg).toBeCloseTo(190, 8);
  });

  test("wraps heading, bounds zoom, and measures great-circle distance", () => {
    expect(canonicalizeDirection(-5, 0).azimuthDeg).toBe(355);
    expect(zoomSkyView(northView, 0.01).fovDeg).toBe(25);
    expect(zoomSkyView(northView, 100).fovDeg).toBe(100);
    expect(
      angularSeparation(
        { azimuthDeg: 0, altitudeDeg: 0 },
        { azimuthDeg: 90, altitudeDeg: 0 },
      ),
    ).toBeCloseTo(90, 8);
  });

  test("zooms celestial disks and their separation with the same projection scale", () => {
    const width = 800;
    const height = 400;
    const sun = { azimuthDeg: 0, altitudeDeg: 0 };
    const moon = { azimuthDeg: 0.35, altitudeDeg: 0 };
    const geometry = (fovDeg: number) => {
      const view = { ...northView, fovDeg };
      const projectedSun = projectDirection(sun, view, width, height);
      const projectedMoon = projectDirection(moon, view, width, height);
      const sunRadius = projectedAngularRadius(
        0.266 * CELESTIAL_DISK_ENLARGEMENT,
        view,
        height,
        projectedSun.depth,
      );
      const moonRadius = projectedAngularRadius(
        0.26 * CELESTIAL_DISK_ENLARGEMENT,
        view,
        height,
        projectedMoon.depth,
      );
      return {
        sunRadius,
        separationToRadiusRatio:
          Math.hypot(
            projectedMoon.x - projectedSun.x,
            projectedMoon.y - projectedSun.y,
          ) /
          (sunRadius + moonRadius),
      };
    };

    const zoomedOut = geometry(100);
    const zoomedIn = geometry(25);
    expect(zoomedIn.sunRadius).toBeGreaterThan(zoomedOut.sunRadius * 4);
    expect(zoomedIn.separationToRadiusRatio).toBeCloseTo(
      zoomedOut.separationToRadiusRatio,
      10,
    );
  });
});
