import { describe, expect, test } from "vitest";
import { eclipseSnapshotMoments } from "../src/components/EclipseTrajectory";
import { eclipseWindowFor } from "../src/eclipse-logic";
import { eclipseEvents } from "../src/live-view";
import type { ObserverLocation } from "../src/types";

const location = (
  latitude: number,
  longitude: number,
  label: string,
): ObserverLocation => ({
  latitude,
  longitude,
  elevationMeters: 20,
  label,
  timezone: "Europe/Madrid",
  source: "preset",
});

describe("trajectory progression snapshots", () => {
  test("shows every totality contact with a transition on either side", () => {
    const window = eclipseWindowFor(location(41.65, -0.89, "Zaragoza"));
    const moments = eclipseSnapshotMoments(eclipseEvents(window));

    expect(moments.map((moment) => moment.key)).toEqual([
      "C1",
      "PRE_TOTAL",
      "C2",
      "MAX",
      "C3",
      "POST_TOTAL",
      "C4",
    ]);
    expect(
      moments.every(
        (moment, index) => index === 0 || moment.time > moments[index - 1].time,
      ),
    ).toBe(true);
  });

  test("fills a partial eclipse with two snapshots around each side of maximum", () => {
    const window = eclipseWindowFor(location(52.37, 4.9, "Amsterdam"));
    const moments = eclipseSnapshotMoments(eclipseEvents(window));

    expect(moments.map((moment) => moment.key)).toEqual([
      "C1",
      "BUILD_1",
      "BUILD_2",
      "MAX",
      "RECEDE_1",
      "RECEDE_2",
      "C4",
    ]);
  });
});
