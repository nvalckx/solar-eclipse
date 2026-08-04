import { describe, expect, test } from "vitest";
import { LAND_PATH } from "../src/map-data";

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
