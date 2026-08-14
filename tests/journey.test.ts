import { describe, expect, test } from "vitest";
import { calculateSkyState, eclipseWindowFor } from "../src/eclipse-logic";
import {
  altitudeDescription,
  directionDescription,
  livePromotionAt,
  localBriefing,
} from "../src/journey";
import type { ObserverLocation } from "../src/types";

const zaragoza: ObserverLocation = {
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
};

describe("guided event journey", () => {
  const window = eclipseWindowFor(zaragoza);
  const state = calculateSkyState(window.peak, zaragoza, window);
  const formatTime = (date: Date) => date.toISOString().slice(11, 16);

  test("describes every altitude band in plain language", () => {
    expect(altitudeDescription(-1)).toBe("below the horizon");
    expect(altitudeDescription(5)).toBe("very low");
    expect(altitudeDescription(20)).toBe("low");
    expect(altitudeDescription(40)).toBe("mid-sky");
    expect(altitudeDescription(60)).toBe("high");
    expect(directionDescription(285, 6)).toBe(
      "W (285°), very low — 6° above the horizon",
    );
  });

  test("creates a local briefing for a total eclipse", () => {
    const briefing = localBriefing(zaragoza, window, state, formatTime);
    expect(briefing.title).toContain("Total eclipse from Zaragoza");
    expect(briefing.summary).toContain("100% of the Sun is covered");
    expect(briefing.summary).toContain("1m 27s");
    expect(briefing.safety).toContain("until totality begins");
  });

  test("uses annularity language and handles an invisible event", () => {
    const annular = {
      ...window,
      localType: "annular" as const,
      visible: true,
    };
    const annularBriefing = localBriefing(zaragoza, annular, state, formatTime);
    expect(annularBriefing.title).toContain("Annular eclipse");
    expect(annularBriefing.summary).toContain("Annularity");

    const invisible = { ...window, visible: false };
    expect(localBriefing(zaragoza, invisible, state, formatTime).title).toBe(
      "No local view from Zaragoza, Spain",
    );
  });

  test("promotes Live at the six-hour and two-hour boundaries", () => {
    expect(
      livePromotionAt(
        new Date(window.start.getTime() - 6 * 60 * 60_000 - 1),
        window,
      ),
    ).toBe("none");
    expect(
      livePromotionAt(
        new Date(window.start.getTime() - 6 * 60 * 60_000),
        window,
      ),
    ).toBe("starting-soon");
    expect(livePromotionAt(window.start, window)).toBe("live");
    expect(livePromotionAt(window.end, window)).toBe("live");
    expect(
      livePromotionAt(new Date(window.end.getTime() + 2 * 60 * 60_000), window),
    ).toBe("replay-ready");
    expect(
      livePromotionAt(
        new Date(window.end.getTime() + 2 * 60 * 60_000 + 1),
        window,
      ),
    ).toBe("none");
  });
});
