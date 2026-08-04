import { describe, expect, test } from "vitest";
import { eclipseWindowFor } from "../src/eclipse-logic";
import {
  eclipseEvents,
  formatCountdown,
  liveSituation,
} from "../src/live-view";
import type { ObserverLocation } from "../src/types";

const zaragoza: ObserverLocation = {
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
};

describe("event-day live state", () => {
  const window = eclipseWindowFor(zaragoza);

  test("orders every local contact and maximum", () => {
    expect(eclipseEvents(window).map((event) => event.key)).toEqual([
      "C1",
      "C2",
      "MAX",
      "C3",
      "C4",
    ]);
  });

  test("moves through countdown, totality, and replay phases", () => {
    const before = liveSituation(
      new Date(window.start.getTime() - 1_000),
      window,
    );
    expect(before.phase).toBe("before");
    expect(before.nextEvent?.key).toBe("C1");

    const total = liveSituation(
      new Date((window.totalStart!.getTime() + window.totalEnd!.getTime()) / 2),
      window,
    );
    expect(total.phase).toBe("total");
    expect(total.nextEvent?.key).toBe("C3");

    expect(
      liveSituation(new Date(window.end.getTime() + 1), window).phase,
    ).toBe("after");
  });

  test("formats long and event-day timers for quick scanning", () => {
    expect(formatCountdown(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000)).toBe(
      "2d 3h 4m",
    );
    expect(formatCountdown(3_661_000)).toBe("01h 01m 01s");
    expect(formatCountdown(0)).toBe("Now");
  });
});
