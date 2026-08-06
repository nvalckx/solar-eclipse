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
  await expect(page.getByTestId("place-Mallorca, Spain")).toBeVisible();
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
  await page.getByTestId("city-search").fill("Molenhoek");
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

test("shows the live clock, trajectory contacts, and integrated sky guide", async ({
  page,
}) => {
  await page.locator("#live").scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: /follow it live/i }),
  ).toBeVisible();
  await expect(page.getByTestId("live-current-time")).toBeVisible();
  await expect(page.getByTestId("live-countdown")).toBeVisible();
  await expect(page.getByTestId("live-event-c1")).toContainText(
    /partial eclipse begins/i,
  );
  const trajectoryCard = page.getByTestId("sky-trajectory-card");
  await expect(trajectoryCard).toHaveAttribute(
    "data-sky-target-azimuth",
    /\d+/,
  );
  await expect(trajectoryCard).toHaveAttribute(
    "data-sky-target-altitude",
    /-?\d+/,
  );
  await expect(page.getByTestId("trajectory-sky-preview")).toHaveAttribute(
    "aria-label",
    /all-sphere sky-guide preview/i,
  );
  await expect(trajectoryCard).toContainText(/drag with a mouse or trackpad/i);
  await expect(page.getByTestId("live-event-c1")).toHaveAttribute(
    "aria-label",
    /azimuth \d+ degrees .+, altitude -?\d+ degrees/i,
  );
  await expect(page.getByTestId("live-event-c1")).toContainText(/° altitude/i);
  await page.getByTestId("live-event-c1").click();
  const firstContactTime = await page
    .getByTestId("eclipse-timeline")
    .inputValue();
  await page.getByTestId("live-event-max").click();
  await expect(page.getByTestId("eclipse-timeline")).not.toHaveValue(
    firstContactTime,
  );
  await trajectoryCard.locator("header").click();
  await expect(page.getByTestId("phone-alignment-dialog")).toBeVisible();
  await page.getByTestId("close-phone-alignment").click();
  await expect(trajectoryCard).toBeFocused();
});

test("enables local contact alerts and follows location changes", async ({
  page,
}) => {
  await page.evaluate(() => {
    class MockNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = async () => {
        MockNotification.permission = "granted";
        return "granted" as NotificationPermission;
      };
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: MockNotification,
    });
  });

  await page.getByTestId("open-notifications").click();
  const dialog = page.getByTestId("notification-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Amsterdam, Netherlands");
  await dialog.getByLabel("Reminder time").selectOption("30");
  await dialog.getByRole("checkbox", { name: /partial eclipse ends/i }).check();
  await page.getByTestId("enable-notifications").click();
  await expect(dialog.getByRole("status")).toContainText(/alerts saved/i);
  await dialog.getByRole("button", { name: /close eclipse alerts/i }).click();
  await expect(page.getByTestId("open-notifications")).toContainText(
    "Alerts on",
  );

  await page.getByTestId("location-picker").click();
  await page.getByTestId("city-search").fill("Copenhagen");
  await page.getByTestId("place-Copenhagen, Denmark").click();
  await page.getByTestId("open-notifications").click();
  await expect(page.getByTestId("notification-dialog")).toContainText(
    "Copenhagen, Denmark",
  );
  await expect(page.getByLabel("Reminder time")).toHaveValue("30");
  await expect(
    page.getByRole("checkbox", { name: /partial eclipse ends/i }),
  ).toBeChecked();
});

test("explores the full sphere, follows the compass, and enables camera AR", async ({
  page,
}) => {
  await page.evaluate(() => {
    class MockOrientationEvent extends Event {
      static requestPermission = async () => "granted";
    }
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: MockOrientationEvent,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => new MediaStream() },
    });
    HTMLMediaElement.prototype.play = async () => undefined;
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 1280,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 720,
    });
    HTMLCanvasElement.prototype.getContext = () =>
      ({
        drawImage: () => undefined,
        clearRect: () => undefined,
        setTransform: () => undefined,
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        closePath: () => undefined,
        arc: () => undefined,
        stroke: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        fill: () => undefined,
        fillRect: () => undefined,
        fillText: () => undefined,
        setLineDash: () => undefined,
        translate: () => undefined,
        rotate: () => undefined,
        createLinearGradient: () => ({ addColorStop: () => undefined }),
        createRadialGradient: () => ({ addColorStop: () => undefined }),
      }) as unknown as CanvasRenderingContext2D;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(new Blob(["photo"], { type: "image/jpeg" }));
    };
  });

  const opener = page.getByTestId("open-sky-guide");
  await opener.click();
  await expect(page.getByTestId("phone-alignment-dialog")).toBeVisible();
  const canvas = page.getByTestId("sky-sphere-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute(
    "aria-label",
    /full 360 degree dashed Sun and Moon trajectories/i,
  );
  expect(
    Number(await canvas.getAttribute("data-sun-trajectory-points")),
  ).toBeGreaterThanOrEqual(145);
  expect(
    Number(await canvas.getAttribute("data-moon-trajectory-points")),
  ).toBeGreaterThanOrEqual(145);
  await expect(page.getByText("PHYSICAL OVERLAP DETAIL")).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /center separation are magnified together, preserving the physical overlap/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Explore mode", { exact: true })).toBeVisible();
  await expect(page.getByTestId("alignment-event-live")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const initialHeading = await canvas.getAttribute("data-heading");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 100,
    box!.y + box!.height / 2,
  );
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute(
    "data-heading",
    initialHeading ?? "",
  );

  await page.getByTestId("sky-guide-compass").click();
  await page.evaluate(() => {
    const event = new Event("deviceorientationabsolute");
    for (const [key, value] of Object.entries({
      alpha: 0,
      beta: 90,
      gamma: 0,
      absolute: true,
    })) {
      Object.defineProperty(event, key, { value });
    }
    window.dispatchEvent(event);
  });
  await expect(
    page.getByText("Compass tracking", { exact: true }),
  ).toBeVisible();
  const sensorHeading = await canvas.getAttribute("data-heading");
  // The live clock re-renders the parent once per second. Sensor listeners must
  // survive that re-render even though the dialog callbacks get new identities.
  await page.waitForTimeout(1_200);
  await page.evaluate(() => {
    for (let reading = 0; reading < 8; reading += 1) {
      const event = new Event("deviceorientationabsolute");
      for (const [key, value] of Object.entries({
        alpha: 90,
        beta: 90,
        gamma: 0,
        absolute: true,
      })) {
        Object.defineProperty(event, key, { value });
      }
      window.dispatchEvent(event);
    }
  });
  await expect
    .poll(() => canvas.getAttribute("data-heading"))
    .not.toBe(sensorHeading);

  const trackedHeading = await canvas.getAttribute("data-heading");
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 - 70,
    box!.y + box!.height / 2 + 30,
  );
  await page.mouse.up();
  await expect(page.getByText("Explore mode", { exact: true })).toBeVisible();
  await expect(canvas).not.toHaveAttribute(
    "data-heading",
    trackedHeading ?? "",
  );
  await page.getByTestId("sky-guide-compass").click();
  await expect(
    page.getByText("Compass tracking", { exact: true }),
  ).toBeVisible();

  await page.getByTestId("sky-guide-camera").click();
  const camera = page.getByTestId("alignment-camera");
  await expect(camera).toBeVisible();
  await expect(camera).toHaveAttribute("autoplay", "");
  await expect(camera).toHaveAttribute("playsinline", "");
  await expect(camera).toHaveClass(/camera-ready/);

  await page.getByTestId("take-alignment-photo").click();
  await expect(page.getByTestId("alignment-photo-review")).toContainText(
    /sky overlay included/i,
  );
  await expect(page.getByTestId("save-alignment-photo")).toHaveAttribute(
    "download",
    /-ar\.jpg$/,
  );
  await page.getByRole("button", { name: "Retake" }).click();
  await page.getByText("Include sky overlay", { exact: true }).click();
  await expect(page.getByTestId("photo-overlay-toggle")).not.toBeChecked();
  await expect(page.getByTestId("take-alignment-photo")).toHaveAttribute(
    "aria-label",
    "Take photo without AR overlay",
  );
  await page.getByTestId("take-alignment-photo").click();
  await expect(page.getByTestId("alignment-photo-review")).toContainText(
    /Camera only/i,
  );
  await expect(page.getByTestId("save-alignment-photo")).toHaveAttribute(
    "download",
    /-camera\.jpg$/,
  );
  await page.getByRole("button", { name: "Retake" }).click();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2);
  await page.mouse.up();
  await expect(page.getByText("Explore mode", { exact: true })).toBeVisible();
  await expect(page.getByTestId("alignment-camera")).toHaveCount(0);
  await page.getByTestId("close-phone-alignment").click();
  await expect(opener).toBeFocused();
});

test("shows the current Sun and Moon and fast-forwards the live sky", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-08-06T12:00:00Z") });
  await page.goto(
    "./?lat=41.65&lon=-0.89&elev=250&tz=Europe%2FMadrid&label=Zaragoza%2C%20Spain",
  );
  await page.getByTestId("open-sky-guide").click();

  const canvas = page.getByTestId("sky-sphere-canvas");
  await expect(page.getByTestId("alignment-event-live")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("sky-guide-sun-position")).toContainText(
    /Sun .* altitude/,
  );
  await expect(page.getByTestId("sky-guide-moon-position")).toContainText(
    /Moon .* altitude/,
  );
  await expect(page.getByTestId("sky-guide-countdown")).toContainText(/d/);
  await expect(
    page.getByLabel("Fast-forward to maximum eclipse"),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-scene-time", /^2026-08-06T12:00:/);

  await page.getByTestId("sky-guide-time-slider").fill("1000");
  await expect(page.getByTestId("alignment-event-live")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(canvas).toHaveAttribute("data-scene-time", /^2026-08-12T/);
  await expect(page.getByText(/^Preview ·/)).toBeVisible();
});

test("falls back to a manual sky finder when camera and motion are denied", async ({
  page,
}) => {
  await page.evaluate(() => {
    class MockOrientationEvent extends Event {
      static requestPermission = async () => "denied";
    }
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: MockOrientationEvent,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => Promise.reject(new Error("denied")),
      },
    });
  });
  await page.getByTestId("open-sky-guide").click();
  const canvas = page.getByTestId("sky-sphere-canvas");
  await expect(canvas).toBeVisible();
  await page.getByTestId("sky-guide-compass").click();
  await expect(page.getByText(/motion access was denied/i)).toBeVisible();
  await expect(
    page.getByTestId("phone-alignment-dialog").locator(".alignment-quality"),
  ).toHaveText("Explore mode");
  await expect(page.getByTestId("sky-guide-camera")).toBeDisabled();
  const heading = await canvas.getAttribute("data-heading");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(canvas).not.toHaveAttribute("data-heading", heading ?? "");
  await page.getByTestId("center-sky-target").click();
  const accessibility = await new AxeBuilder({ page })
    .include("[data-testid='phone-alignment-dialog']")
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(
    await page
      .getByTestId("phone-alignment-dialog")
      .evaluate((dialog) => dialog.scrollWidth - dialog.clientWidth),
  ).toBeLessThanOrEqual(0);
});

test("refreshes the device location before using the sky guide", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 41.65,
    longitude: -0.89,
    accuracy: 24,
  });
  await context.grantPermissions(["geolocation"], {
    origin: "http://127.0.0.1:4173",
  });
  await page.getByTestId("open-sky-guide").click();
  await page.getByTestId("refresh-alignment-location").click();
  await expect(
    page.getByTestId("phone-alignment-dialog").getByText(/location refreshed/i),
  ).toContainText(/accurate to about 24 m/i);
  await expect(
    page
      .getByTestId("phone-alignment-dialog")
      .getByText("Your current location"),
  ).toBeVisible();
});

test("auto-follows the live eclipse while local contacts are in progress", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-08-12T18:29:20Z") });
  await page.goto(
    "./?lat=41.65&lon=-0.89&elev=250&tz=Europe%2FMadrid&label=Zaragoza%2C%20Spain",
  );
  await page.evaluate(() => {
    class MockOrientationEvent extends Event {
      static requestPermission = async () => "denied";
    }
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: MockOrientationEvent,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => Promise.reject(new Error("denied")) },
    });
  });
  await page.getByTestId("open-sky-guide").click();
  await expect(page.getByTestId("alignment-event-live")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("alignment-event-max").click();
  await expect(page.getByTestId("alignment-event-max")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("alignment-event-live").click();
  await expect(page.getByTestId("alignment-event-live")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("opens the verified path dialog and restores focus", async ({ page }) => {
  const previousTime = await page.getByTestId("eclipse-timeline").inputValue();
  const opener = page.getByTestId("open-map");
  await opener.click();
  await expect(
    page.getByRole("dialog", { name: /where totality travels/i }),
  ).toBeVisible();
  const map = page.getByTestId("path-map");
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-shadow-time", /\d{2}:\d{2}/);
  await expect(page.getByTestId("path-playback")).toHaveAttribute(
    "aria-label",
    "Pause path replay",
  );
  const europeView = await map.getAttribute("viewBox");
  await page.getByTestId("path-full-view").click();
  await expect(map).not.toHaveAttribute("viewBox", europeView ?? "");
  await page.getByTestId("path-playback").click();
  const pausedTime = await map.getAttribute("data-shadow-time");
  await page.waitForTimeout(100);
  await expect(map).toHaveAttribute("data-shadow-time", pausedTime ?? "");
  await page.getByTestId("path-restart").click();
  await expect(page.getByTestId("path-playback")).toHaveAttribute(
    "aria-label",
    "Pause path replay",
  );
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(page.getByTestId("eclipse-timeline")).toHaveValue(previousTime);
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
