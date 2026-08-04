import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /see the shadow arrive/i }),
  ).toBeVisible();
});

test("@smoke runs without cross-origin requests or console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== "http://127.0.0.1:4173")
      external.push(request.url());
  });
  await page.reload();
  await page.getByTestId("location-picker").click();
  await expect(page.getByTestId("location-map")).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("searches featured places and persists the selection", async ({
  page,
}) => {
  await expect(page.getByTestId("location-picker")).toContainText(
    "Amsterdam, Netherlands",
  );
  await page.getByTestId("location-picker").click();
  await expect(page.getByTestId("place-Amsterdam, Netherlands")).toBeVisible();
  await page.getByTestId("city-search").fill("Atlantis");
  await expect(page.getByText(/no featured match/i)).toBeVisible();
  await page.getByTestId("city-search").fill("Copenhagen");
  await page.getByTestId("place-Copenhagen, Denmark").click();
  await expect(page.getByTestId("location-picker")).toContainText(
    "Copenhagen, Denmark",
  );
  await page.reload();
  await expect(page.getByTestId("location-picker")).toContainText(
    "Copenhagen, Denmark",
  );
});

test("zooms the location picker map", async ({ page }) => {
  await page.getByTestId("location-picker").click();
  const map = page.getByTestId("location-map");
  const initialViewBox = await map.getAttribute("viewBox");
  await page.getByTestId("location-map-zoom-in").click();
  await expect(map).not.toHaveAttribute("viewBox", initialViewBox ?? "");
  await page.getByTestId("location-map-zoom-out").click();
  await expect(map).toHaveAttribute("viewBox", initialViewBox ?? "");
});

test("reveals the Molenhoek golf easter egg", async ({ page }) => {
  await page.getByTestId("location-picker").click();
  await page.getByTestId("place-Pitch&Putt Molenhoek").click();
  await expect(page.getByTestId("sky-canvas")).toHaveAttribute(
    "data-golf-hole",
    "true",
  );
  await page.getByTestId("mode-closeup").click();
  await expect(page.getByTestId("sky-canvas")).toHaveAttribute(
    "data-golf-hole",
    "false",
  );
});

test("supports coordinate and time-zone confirmation", async ({ page }) => {
  await page.getByTestId("location-picker").click();
  await page.getByLabel("Latitude").fill("64.15");
  await page.getByLabel("Longitude").fill("-21.94");
  await page.getByLabel("Time zone").fill("Atlantic/Reykjavik");
  await page.getByTestId("apply-location").click();
  await expect(page.getByTestId("location-picker")).toContainText(/64\.15° N/);
});

test("switches views and controls the timeline and playback", async ({
  page,
}) => {
  await page.getByTestId("mode-closeup").click();
  await expect(page.getByTestId("mode-closeup")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText(/magnified equally/i)).toBeVisible();
  await page.getByTestId("mode-sky").click();
  await page.getByTestId("maximum-time").click();
  await page.getByTestId("speed-180").click();
  await expect(page.getByTestId("speed-180")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("playback").click();
  await expect(page.getByTestId("playback")).toHaveAttribute(
    "aria-label",
    "Pause playback",
  );
  await page.getByTestId("playback").click();
  await expect(page.getByTestId("playback")).toHaveAttribute(
    "aria-label",
    "Play playback",
  );
});

test("opens the verified path dialog and restores focus", async ({ page }) => {
  const opener = page.getByTestId("open-map");
  await opener.click();
  await expect(
    page.getByRole("dialog", { name: /where totality travels/i }),
  ).toBeVisible();
  await expect(page.getByTestId("path-map")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("copies a versioned share URL", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (url: string) => {
          (window as Window & { sharedUrl?: string }).sharedUrl = url;
        },
      },
    });
  });
  await page.getByTestId("share-view").click();
  const sharedUrl = await page.evaluate(
    () => (window as Window & { sharedUrl?: string }).sharedUrl,
  );
  expect(sharedUrl).toContain("v=1");
  expect(sharedUrl).toContain("mode=sky");
});

test("offers a selectable share fallback when clipboard access fails", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error("denied")) },
    });
  });
  await page.getByTestId("share-view").click();
  await expect(
    page.getByRole("dialog", { name: /copy your eclipse view/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Share link")).toHaveValue(/v=1/);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("share-view")).toBeFocused();
});

test("handles geolocation success and unsupported browsers", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 55.68,
    longitude: 12.57,
    accuracy: 10,
  });
  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  await page.getByTestId("location-picker").click();
  await page.getByTestId("use-my-location").click();
  await expect(page.getByRole("status")).toContainText(/location found/i);
  await page.getByTestId("apply-location").click();
  await expect(page.getByTestId("location-picker")).toContainText(
    "Your location",
  );

  await page.getByTestId("location-picker").click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.getByTestId("use-my-location").click();
  await expect(page.getByRole("status")).toContainText(/not available/i);
});

test("accepts legacy links and clamps malformed input", async ({ page }) => {
  await page.goto(
    "./?lat=55.68&lon=12.57&elev=10&tz=Europe%2FCopenhagen&label=Copenhagen%2C%20Denmark&mode=closeup",
  );
  await expect(page.getByTestId("location-picker")).toContainText(
    "Copenhagen, Denmark",
  );
  await expect(page.getByTestId("mode-closeup")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("./?lat=999&lon=12&tz=UTC");
  await expect(page.getByTestId("location-picker")).toContainText(
    "Copenhagen, Denmark",
  );
});

test("has no detectable accessibility violations or horizontal overflow", async ({
  page,
}) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      0,
    );
  }
});

test("renders simulator layouts at Chromium breakpoints", async ({
  page,
}, testInfo) => {
  test.skip(
    !["chromium", "mobile-chromium"].includes(testInfo.project.name),
    "Layout checks target Chromium projects.",
  );
  await page.getByTestId("maximum-time").click();
  await expect(page.locator("#simulator-title")).toBeVisible();
  await expect(page.getByTestId("sky-canvas")).toHaveAttribute(
    "aria-label",
    /^Sky view\./i,
  );

  const skyLayout = await page.evaluate(() => {
    const simulator = document
      .querySelector("#simulator")
      ?.getBoundingClientRect();
    const canvas = document
      .querySelector("[data-testid='sky-canvas']")
      ?.getBoundingClientRect();
    return {
      simulatorWidth: simulator?.width ?? 0,
      simulatorHeight: simulator?.height ?? 0,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(skyLayout.simulatorWidth).toBeGreaterThan(300);
  expect(skyLayout.simulatorHeight).toBeGreaterThan(500);
  expect(skyLayout.canvasWidth).toBeGreaterThan(300);
  expect(skyLayout.canvasHeight).toBeGreaterThan(300);
  expect(skyLayout.horizontalOverflow).toBeLessThanOrEqual(0);

  await page.getByTestId("mode-closeup").click();
  await expect(page.getByTestId("mode-closeup")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("sky-canvas")).toHaveAttribute(
    "aria-label",
    /^Magnified close-up\./i,
  );
});
