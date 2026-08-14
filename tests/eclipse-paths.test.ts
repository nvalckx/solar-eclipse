import { describe, expect, test } from "vitest";
import { loadEclipsePath } from "../src/eclipse-paths";

describe("generated eclipse paths", () => {
  test("loads the inclusive 2142 central path lazily", async () => {
    const path = await loadEclipsePath("2142-05-25");
    expect(path?.eventId).toBe("2142-05-25");
    expect(path?.north.length).toBeGreaterThan(100);
    expect(path?.centerline.length).toBeGreaterThan(100);
    expect(path?.south.length).toBeGreaterThan(100);
    expect(path?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(path?.sourceUrl).toContain("Ecl=21420525");
  });

  test("does not invent a central path for partial eclipses", async () => {
    await expect(loadEclipsePath("2029-01-14")).resolves.toBeUndefined();
  });
});
