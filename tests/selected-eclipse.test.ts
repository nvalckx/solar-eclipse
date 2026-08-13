import { describe, expect, test } from "vitest";
import {
  calculateSkyState,
  eclipseWindowFor,
  localEclipseFor,
  nextLocalTotalEclipse,
  nextVisibleEclipse,
} from "../src/eclipse-logic";
import type { ObserverLocation } from "../src/types";

const location = (
  latitude: number,
  longitude: number,
  label: string,
): ObserverLocation => ({
  latitude,
  longitude,
  elevationMeters: 0,
  label,
  timezone: "UTC",
  source: "coordinates",
});

describe("selected eclipse calculations", () => {
  test("returns not-visible instead of silently substituting the next event", () => {
    const result = localEclipseFor(
      "2026-08-12",
      location(-33.87, 151.21, "Sydney"),
    );
    expect(result).toMatchObject({
      visible: false,
      eventId: "2026-08-12",
      reason: "not-visible",
    });
    expect(() =>
      eclipseWindowFor(location(-33.87, 151.21, "Sydney"), "2026-08-12"),
    ).toThrow(/not visible/);
  });

  test("reports annularity locally and retains its safety-relevant phase", () => {
    const result = localEclipseFor(
      "2027-02-06",
      location(-31, -48, "South Atlantic"),
    );
    expect(result.visible).toBe(true);
    if (!result.visible) return;
    expect(result.window.globalType).toBe("annular");
    expect(result.window.localType).toBe("annular");
    expect(result.window.centralStart).toBeInstanceOf(Date);
    expect(result.window.totalStart).toBeUndefined();

    const partial = calculateSkyState(
      new Date(
        (result.window.start.getTime() +
          result.window.centralStart!.getTime()) /
          2,
      ),
      location(-31, -48, "South Atlantic"),
      result.window,
    );
    const annular = calculateSkyState(
      new Date(
        (result.window.centralStart!.getTime() +
          result.window.centralEnd!.getTime()) /
          2,
      ),
      location(-31, -48, "South Atlantic"),
      result.window,
    );
    expect(partial.eclipse.type).toBe("partial");
    expect(annular.eclipse.type).toBe("annular");
    expect(annular.eclipse.secondContact).toBe(
      result.window.centralStart?.toISOString(),
    );
    expect(annular.eclipse.thirdContact).toBe(
      result.window.centralEnd?.toISOString(),
    );
  });

  test("retains hybrid globally while reporting the actual central local phase", () => {
    const result = localEclipseFor(
      "2031-11-14",
      location(-1, -138, "Central Pacific"),
    );
    expect(result.visible).toBe(true);
    if (!result.visible) return;
    expect(result.window.globalType).toBe("hybrid");
    expect(["partial", "annular", "total"]).toContain(result.window.localType);
    expect(result.window.phaseLabel).toMatch(/^Hybrid eclipse/);
  });

  test("finds the next visible event from the requested instant", () => {
    const result = nextVisibleEclipse(
      location(41.65, -0.89, "Zaragoza"),
      new Date("2026-08-01T00:00:00Z"),
    );
    expect(result?.eventId).toBe("2026-08-12");

    const during = nextVisibleEclipse(
      location(41.65, -0.89, "Zaragoza"),
      new Date("2026-08-12T18:31:00Z"),
    );
    expect(during?.eventId).toBe("2026-08-12");
  });

  test("finds the 2135 total eclipse for Groningen", () => {
    const groningen = location(53.2194, 6.5665, "Groningen");
    const selected = localEclipseFor("2135-10-07", groningen);
    expect(selected.visible).toBe(true);
    if (!selected.visible) return;
    expect(selected.window.localType).toBe("total");
    expect(selected.window.totalityDurationSeconds).toBeGreaterThan(0);

    const nextTotal = nextLocalTotalEclipse(
      groningen,
      new Date("2026-08-13T00:00:00Z"),
    );
    expect(nextTotal?.eventId).toBe("2135-10-07");
  });
});
