import { describe, expect, test } from "vitest";
import { magneticDeclination } from "../src/magnetic-declination";
import { orientationReadingFromEvent } from "../src/orientation-sensor";
import {
  alignmentGuidance,
  alignmentMarkerPosition,
  cameraOrientationFromAngles,
  circularJitter,
  signedAngleDelta,
  smoothReading,
} from "../src/phone-alignment";

describe("phone alignment math", () => {
  test("projects the rear camera axis into heading and altitude", () => {
    const north = cameraOrientationFromAngles(0, 90, 0);
    expect(north.headingDeg).toBeCloseTo(0, 5);
    expect(north.altitudeDeg).toBeCloseTo(0, 5);
    expect(cameraOrientationFromAngles(90, 90, 0).headingDeg).toBeCloseTo(
      270,
      5,
    );
    expect(cameraOrientationFromAngles(0, 135, 0).altitudeDeg).toBeCloseTo(
      45,
      5,
    );
  });

  test("handles north wraparound and smooths across it", () => {
    expect(signedAngleDelta(358, 2)).toBe(4);
    const base = {
      headingDeg: 358,
      altitudeDeg: 10,
      rollDeg: 0,
      source: "absolute" as const,
      timestamp: 1,
    };
    expect(
      smoothReading(base, { ...base, headingDeg: 2, timestamp: 2 }, 0.5)
        .headingDeg,
    ).toBeCloseTo(0, 5);
    expect(circularJitter([359, 0, 1])).toBeLessThan(1);
  });

  test("only claims alignment for accurate, stable readings", () => {
    const reading = {
      headingDeg: 280,
      altitudeDeg: 20,
      rollDeg: 0,
      accuracyDeg: 5,
      source: "webkit-magnetic" as const,
      timestamp: 1,
    };
    expect(
      alignmentGuidance(reading, { azimuthDeg: 282, altitudeDeg: 18 }, 2)
        .aligned,
    ).toBe(true);
    expect(
      alignmentGuidance(
        { ...reading, accuracyDeg: 20 },
        { azimuthDeg: 282, altitudeDeg: 18 },
        2,
      ),
    ).toMatchObject({ aligned: false, quality: "poor" });
  });

  test("moves and clamps the AR target across the finder", () => {
    expect(
      alignmentMarkerPosition({
        headingDeltaDeg: 0,
        altitudeDeltaDeg: 0,
      }),
    ).toEqual({ leftPercent: 50, topPercent: 50, inFinder: true });
    expect(
      alignmentMarkerPosition({
        headingDeltaDeg: 17.5,
        altitudeDeltaDeg: 12.5,
      }),
    ).toEqual({ leftPercent: 70, topPercent: 30, inFinder: true });
    expect(
      alignmentMarkerPosition({
        headingDeltaDeg: -180,
        altitudeDeltaDeg: 90,
      }),
    ).toEqual({ leftPercent: 10, topPercent: 10, inFinder: false });
  });

  test("normalizes Android absolute and iOS magnetic compass readings", () => {
    const android = orientationReadingFromEvent(
      { alpha: 90, beta: 90, gamma: 0, absolute: true },
      8,
      0,
      1,
    );
    expect(android).toMatchObject({
      headingDeg: 270,
      source: "absolute",
    });

    const ios = orientationReadingFromEvent(
      {
        alpha: null,
        beta: 90,
        gamma: 0,
        absolute: false,
        webkitCompassHeading: 350,
        webkitCompassAccuracy: 6,
      },
      10,
      90,
      2,
    );
    expect(ios).toMatchObject({
      headingDeg: 0,
      rollDeg: 90,
      accuracyDeg: 6,
      source: "webkit-magnetic",
    });
  });
});

describe("WMM2025 true-north correction", () => {
  test.each([
    [80, 0, 0, "2025-01-01T00:00:00Z", 1.28],
    [0, 120, 0, "2025-01-01T00:00:00Z", -0.16],
    [-80, 240, 0, "2025-01-01T00:00:00Z", 68.78],
    [80, 0, 100_000, "2027-07-02T12:00:00Z", 2.16],
  ])(
    "matches NOAA reference declination at %s, %s",
    (latitude, longitude, elevation, timestamp, expected) => {
      expect(
        magneticDeclination(
          latitude as number,
          longitude as number,
          elevation as number,
          new Date(timestamp as string),
        ),
      ).toBeCloseTo(expected as number, 1);
    },
  );
});
