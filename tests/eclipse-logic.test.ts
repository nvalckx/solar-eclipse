import { describe, expect, test } from "vitest";
import {
  calculateSkyState,
  circleOverlapPercent,
  eclipseWindowFor,
} from "../src/eclipse-logic";
import type { ObserverLocation } from "../src/types";

const location = (overrides: Partial<ObserverLocation>): ObserverLocation => ({
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
  ...overrides,
});

describe("eclipse geometry", () => {
  test("handles separated, tangent, and full-coverage disks", () => {
    expect(circleOverlapPercent(1, 1, 2)).toBe(0);
    expect(circleOverlapPercent(1, 1, 0)).toBe(100);
    expect(circleOverlapPercent(1, 1.2, 0.1)).toBe(100);
    expect(circleOverlapPercent(1, 1, 1)).toBeCloseTo(39.1, 1);
  });

  test("reports all four contacts and totality duration for Zaragoza", () => {
    const eclipse = eclipseWindowFor(location({}));
    expect(eclipse.start.toISOString()).toBe("2026-08-12T17:34:34.257Z");
    expect(eclipse.totalStart?.toISOString()).toBe("2026-08-12T18:28:53.339Z");
    expect(eclipse.totalEnd?.toISOString()).toBe("2026-08-12T18:30:20.081Z");
    expect(eclipse.end.toISOString()).toBe("2026-08-12T19:21:19.635Z");
    expect(eclipse.totalityDurationSeconds).toBeCloseTo(86.742, 2);
    expect(
      calculateSkyState(eclipse.peak, location({}), eclipse).eclipse.type,
    ).toBe("total");
  });

  test("matches the Copenhagen partial obscuration fixture", () => {
    const copenhagen = location({
      latitude: 55.68,
      longitude: 12.57,
      elevationMeters: 10,
      label: "Copenhagen, Denmark",
      timezone: "Europe/Copenhagen",
    });
    const eclipse = eclipseWindowFor(copenhagen);
    const state = calculateSkyState(eclipse.peak, copenhagen, eclipse);
    expect(state.eclipse.type).toBe("partial");
    expect(Math.abs(state.eclipse.obscurationPercent - 83.4358)).toBeLessThan(
      0.5,
    );
  });

  test("keeps a near-boundary Madrid fixture partial", () => {
    const madrid = location({
      latitude: 40.42,
      longitude: -3.7,
      elevationMeters: 650,
      label: "Madrid, Spain",
    });
    const eclipse = eclipseWindowFor(madrid);
    const state = calculateSkyState(eclipse.peak, madrid, eclipse);
    expect(eclipse.totalStart).toBeUndefined();
    expect(state.eclipse.type).toBe("partial");
    expect(state.eclipse.obscurationPercent).toBeGreaterThan(99.9);
  });

  test("reports no visible coverage outside the window and below the horizon", () => {
    const observer = location({});
    const eclipse = eclipseWindowFor(observer);
    const before = calculateSkyState(
      new Date(eclipse.start.getTime() - 60_000),
      observer,
      eclipse,
    );
    const night = calculateSkyState(
      new Date("2026-08-12T00:00:00Z"),
      observer,
      eclipse,
    );
    expect(before.eclipse.visible).toBe(false);
    expect(before.eclipse.obscurationPercent).toBe(0);
    expect(night.eclipse.visible).toBe(false);
    expect(night.twilightLevel).toBe("night");
  });
});
