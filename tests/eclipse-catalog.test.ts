import { describe, expect, test } from "vitest";
import {
  ECLIPSE_CATALOG,
  ECLIPSE_CATALOG_METADATA,
  eclipseById,
  eclipseNearPeak,
  eclipsesInDecade,
  upcomingEclipses,
} from "../src/eclipse-catalog";

describe("generated eclipse catalog", () => {
  test("is ordered, unique, and includes both promised endpoints", () => {
    expect(ECLIPSE_CATALOG.length).toBeGreaterThan(200);
    expect(ECLIPSE_CATALOG[0]?.id).toBe("2026-08-12");
    expect(ECLIPSE_CATALOG.at(-1)?.id).toBe("2142-05-25");
    expect(ECLIPSE_CATALOG_METADATA.range).toEqual({
      start: "2026-08-12",
      end: "2142-05-25",
    });
    const ids = ECLIPSE_CATALOG.map((record) => record.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  test("preserves NASA hybrid classification and provenance", () => {
    expect(eclipseById("2031-11-14")?.type).toBe("hybrid");
    expect(ECLIPSE_CATALOG_METADATA.sources).toHaveLength(2);
    expect(
      ECLIPSE_CATALOG_METADATA.sources.every((source) =>
        /^https:\/\/eclipse\.gsfc\.nasa\.gov\//.test(source.url),
      ),
    ).toBe(true);
  });

  test("supports date and decade browsing without mutating catalog order", () => {
    expect(upcomingEclipses(new Date("2027-01-01T00:00:00Z"))[0]?.id).toBe(
      "2027-02-06",
    );
    expect(eclipsesInDecade(2140).at(-1)?.id).toBe("2142-05-25");
  });

  test("matches a local peak even when its UTC date differs", () => {
    expect(eclipseNearPeak(new Date("2026-08-13T13:47:06Z"))?.id).toBe(
      "2026-08-12",
    );
  });
});
