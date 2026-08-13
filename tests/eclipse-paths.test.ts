import { describe, expect, test } from "vitest";
import { loadEclipsePath } from "../src/eclipse-paths";

describe("generated eclipse paths", () => {
  test("loads the inclusive 2135 central path lazily", async () => {
    const path = await loadEclipsePath("2135-10-07");
    expect(path?.eventId).toBe("2135-10-07");
    expect(path?.north.length).toBeGreaterThan(100);
    expect(path?.centerline.length).toBeGreaterThan(100);
    expect(path?.south.length).toBeGreaterThan(100);
    expect(path?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(path?.sourceUrl).toContain("Ecl=21351007");
  });

  test("does not invent a central path for partial eclipses", async () => {
    await expect(loadEclipsePath("2029-01-14")).resolves.toBeUndefined();
  });
});
