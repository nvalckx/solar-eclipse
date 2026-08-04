import { describe, expect, test } from "vitest";
import {
  LAND_PATH,
  interpolateCoordinate,
  PATH_END_MS,
  PATH_START_MS,
  pathShadowAt,
  TOTALITY_FRAMES,
} from "../src/map-data";

describe("world map geometry", () => {
  test("does not connect land across the antimeridian", () => {
    const commands = LAND_PATH.match(/[ML]-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?|Z/g);
    let previousX: number | undefined;

    for (const command of commands ?? []) {
      if (command === "Z") {
        previousX = undefined;
        continue;
      }

      const point = /[ML](-?\d+(?:\.\d+)?),/.exec(command);
      expect(point).not.toBeNull();
      const x = Number(point?.[1]);

      if (command.startsWith("L") && previousX !== undefined) {
        expect(Math.abs(x - previousX)).toBeLessThanOrEqual(450);
      }
      previousX = x;
    }
  });
});

describe("animated eclipse path geometry", () => {
  test("returns exact frame coordinates", () => {
    const first = TOTALITY_FRAMES[0];
    const shadow = pathShadowAt(first.timestampMs);

    expect(shadow.center).toEqual(first.center);
    expect(shadow.north).toEqual(first.north);
    expect(shadow.south).toEqual(first.south);
    expect(shadow.widthKm).toBeGreaterThan(0);
  });

  test("interpolates between frames", () => {
    const from = TOTALITY_FRAMES[0];
    const to = TOTALITY_FRAMES[1];
    const midpoint = pathShadowAt((from.timestampMs + to.timestampMs) / 2);

    expect(midpoint.center[0]).toBeCloseTo(
      (from.center[0] + to.center[0]) / 2,
      5,
    );
    expect(midpoint.center[1]).toBeCloseTo(
      (from.center[1] + to.center[1]) / 2,
      5,
    );
    expect(midpoint.radiusKm).toBeGreaterThan(0);
  });

  test("clamps timestamps outside the path interval", () => {
    expect(pathShadowAt(PATH_START_MS - 1).timestampMs).toBe(PATH_START_MS);
    expect(pathShadowAt(PATH_END_MS + 1).timestampMs).toBe(PATH_END_MS);
  });

  test("interpolates across the antimeridian using the short route", () => {
    const midpoint = interpolateCoordinate([179, 0], [-179, 0], 0.5);
    expect(Math.abs(midpoint[0])).toBe(180);
    expect(midpoint[1]).toBe(0);
  });
});
