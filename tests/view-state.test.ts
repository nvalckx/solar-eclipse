import { describe, expect, test } from "vitest";
import {
  buildShareUrl,
  parseStoredEclipseId,
  parseSharedView,
  parseStoredLocation,
  serializeStoredLocation,
  serializeStoredEclipseId,
} from "../src/view-state";
import type { ObserverLocation } from "../src/types";

const fallback: ObserverLocation = {
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
};

describe("persisted and shared views", () => {
  test("migrates the legacy saved-location shape", () => {
    const legacy = JSON.stringify({
      latitude: 55.68,
      longitude: 12.57,
      elevationMeters: 10,
      label: "Copenhagen",
      timezone: "Europe/Copenhagen",
    });
    expect(parseStoredLocation(legacy)).toMatchObject({
      label: "Copenhagen",
      source: "coordinates",
    });
  });

  test("round-trips the versioned storage shape", () => {
    expect(parseStoredLocation(serializeStoredLocation(fallback))).toEqual(
      fallback,
    );
  });

  test("stores the selected eclipse independently from the location", () => {
    expect(parseStoredEclipseId(serializeStoredEclipseId("2135-10-07"))).toBe(
      "2135-10-07",
    );
    expect(parseStoredEclipseId('"2027-02-30"')).toBeNull();
    expect(parseStoredEclipseId("broken")).toBeNull();
  });

  test("rejects malformed storage and invalid shared coordinates", () => {
    expect(parseStoredLocation("{broken")).toBeNull();
    expect(parseSharedView("?lat=999&lon=1&tz=UTC", fallback).location).toEqual(
      fallback,
    );
  });

  test("accepts legacy links and the close-up mode", () => {
    const view = parseSharedView(
      "?lat=55.68&lon=12.57&elev=10&tz=Europe%2FCopenhagen&label=Copenhagen&time=2026-08-12T18%3A00%3A00Z&mode=closeup",
      fallback,
    );
    expect(view.location).toMatchObject({
      latitude: 55.68,
      longitude: 12.57,
      label: "Copenhagen",
    });
    expect(view.timestamp?.toISOString()).toBe("2026-08-12T18:00:00.000Z");
    expect(view.mode).toBe("closeup");
    expect(view.version).toBe(1);
    expect(view.eclipseId).toBeUndefined();
  });

  test("parses v2 event links and accepts time as a legacy timestamp alias", () => {
    const view = parseSharedView(
      "?v=2&eclipse=2135-10-07&time=2135-10-07T10%3A00%3A00Z",
      fallback,
    );
    expect(view.version).toBe(2);
    expect(view.eclipseId).toBe("2135-10-07");
    expect(view.timestamp?.toISOString()).toBe("2135-10-07T10:00:00.000Z");
  });

  test("builds a versioned share URL without preserving unrelated query parameters", () => {
    const url = new URL(
      buildShareUrl(
        "https://example.test/eclipse/?junk=1",
        fallback,
        new Date("2026-08-12T18:29:36Z"),
        "sky",
      ),
    );
    expect(url.searchParams.get("v")).toBe("2");
    expect(url.searchParams.get("eclipse")).toBe("2026-08-12");
    expect(url.searchParams.get("junk")).toBeNull();
    expect(url.searchParams.get("mode")).toBe("sky");
    expect(url.searchParams.get("tz")).toBe("Europe/Madrid");
    expect(url.searchParams.get("t")).toBe("2026-08-12T18:29:36.000Z");
    expect(url.searchParams.get("time")).toBeNull();
  });

  test("builds a share URL for the selected century-catalog event", () => {
    const url = new URL(
      buildShareUrl(
        "https://example.test/eclipse/",
        fallback,
        new Date("2135-10-07T10:00:00Z"),
        "closeup",
        "2135-10-07",
      ),
    );
    expect(url.searchParams.get("eclipse")).toBe("2135-10-07");
  });
});
