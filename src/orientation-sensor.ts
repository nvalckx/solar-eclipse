import { magneticDeclination } from "./magnetic-declination";
import {
  cameraOrientationFromAcceleration,
  cameraOrientationFromAngles,
  normalizeDegrees,
  signedAngleDelta,
  type OrientationReading,
} from "./phone-alignment";
import type { ObserverLocation } from "./types";

type PermissionState = "granted" | "denied" | "prompt";

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
};

type MotionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

type WebKitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

export type OrientationEventValues = {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

export type OrientationController = {
  stop: () => void;
  source: "listening";
  getCapability: () => OrientationReading["capability"];
};

export type OrientationStartResult =
  | OrientationController
  | { source: "unsupported" | "denied" | "error"; message: string };

function screenAngle() {
  const legacyWindow = window as Window & { orientation?: number };
  return screen.orientation?.angle ?? legacyWindow.orientation ?? 0;
}

export function orientationReadingFromEvent(
  values: OrientationEventValues,
  magneticDeclinationDeg: number,
  screenAngleDeg: number,
  timestamp: number,
): OrientationReading | null {
  const webkitHeading = values.webkitCompassHeading;
  if (
    !Number.isFinite(values.beta) ||
    !Number.isFinite(values.gamma) ||
    (!Number.isFinite(values.alpha) && !Number.isFinite(webkitHeading))
  )
    return null;
  const magnetic = !values.absolute && Number.isFinite(webkitHeading);
  const alpha = magnetic
    ? normalizeDegrees(360 - (webkitHeading! + magneticDeclinationDeg))
    : values.alpha!;
  const projected = cameraOrientationFromAngles(
    alpha,
    values.beta!,
    values.gamma!,
    screenAngleDeg,
  );
  return {
    ...projected,
    accuracyDeg:
      typeof values.webkitCompassAccuracy === "number" &&
      values.webkitCompassAccuracy >= 0
        ? values.webkitCompassAccuracy
        : undefined,
    source: values.absolute
      ? "absolute"
      : magnetic
        ? "webkit-magnetic"
        : "relative",
    capability: values.absolute || magnetic ? "absolute" : "relative",
    timestamp,
  };
}

export async function startOrientationSensor(
  location: ObserverLocation,
  onReading: (reading: OrientationReading) => void,
  initialHeadingDeg = 0,
): Promise<OrientationStartResult> {
  if (
    !window.isSecureContext ||
    (!("DeviceOrientationEvent" in window) && !("DeviceMotionEvent" in window))
  ) {
    return {
      source: "unsupported",
      message: "Motion sensors are unavailable in this browser.",
    };
  }

  const constructor = window.DeviceOrientationEvent as
    OrientationConstructor | undefined;
  const motionConstructor = window.DeviceMotionEvent as
    MotionConstructor | undefined;
  try {
    if (typeof constructor?.requestPermission === "function") {
      let permission: PermissionState;
      try {
        permission = await constructor.requestPermission(true);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        permission = await constructor.requestPermission();
      }
      if (permission !== "granted") {
        return {
          source: "denied",
          message: "Motion access was denied. Use the manual bearing instead.",
        };
      }
    }
    if (
      !constructor &&
      typeof motionConstructor?.requestPermission === "function" &&
      (await motionConstructor.requestPermission()) !== "granted"
    ) {
      return {
        source: "denied",
        message: "Motion access was denied. Drag the sky to explore instead.",
      };
    }
  } catch {
    return {
      source: "error",
      message: "Motion access could not be started. Use the manual bearing.",
    };
  }

  let receivedAbsolute = false;
  let receivedOrientation = false;
  let relativeOffset: number | null = null;
  let lastHeading = initialHeadingDeg;
  let capability: OrientationReading["capability"] = "none";
  let pending: OrientationReading | null = null;
  let frame = 0;
  const declination = magneticDeclination(
    location.latitude,
    location.longitude,
    location.elevationMeters,
    new Date(),
  );

  const emit = (reading: OrientationReading) => {
    pending = reading;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      onReading(pending);
      pending = null;
    });
  };

  const read = (event: Event) => {
    const orientation = event as WebKitOrientationEvent;
    const isAbsoluteEvent =
      event.type === "deviceorientationabsolute" || orientation.absolute;
    if (isAbsoluteEvent) receivedAbsolute = true;
    if (!isAbsoluteEvent && receivedAbsolute) return;

    let reading = orientationReadingFromEvent(
      {
        alpha: orientation.alpha,
        beta: orientation.beta,
        gamma: orientation.gamma,
        absolute: isAbsoluteEvent,
        webkitCompassHeading: orientation.webkitCompassHeading,
        webkitCompassAccuracy: orientation.webkitCompassAccuracy,
      },
      declination,
      screenAngle(),
      performance.now(),
    );
    if (!reading) return;
    receivedOrientation = true;
    if (reading.source === "relative") {
      relativeOffset ??= signedAngleDelta(
        reading.headingDeg,
        initialHeadingDeg,
      );
      reading = {
        ...reading,
        headingDeg: normalizeDegrees(reading.headingDeg + relativeOffset),
      };
    }
    lastHeading = reading.headingDeg;
    capability = reading.capability;
    emit(reading);
  };

  const readMotion = (event: DeviceMotionEvent) => {
    if (receivedOrientation) return;
    const gravity = event.accelerationIncludingGravity;
    if (
      !gravity ||
      !Number.isFinite(gravity.x) ||
      !Number.isFinite(gravity.y) ||
      !Number.isFinite(gravity.z)
    )
      return;
    const projected = cameraOrientationFromAcceleration(
      gravity.x!,
      gravity.y!,
      gravity.z!,
      lastHeading,
      screenAngle(),
    );
    capability = "tilt";
    emit({
      ...projected,
      source: "tilt",
      capability: "tilt",
      timestamp: performance.now(),
    });
  };

  if (constructor) {
    window.addEventListener("deviceorientationabsolute", read);
    window.addEventListener("deviceorientation", read);
  }
  window.addEventListener("devicemotion", readMotion);
  return {
    source: "listening",
    getCapability: () => capability,
    stop: () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientationabsolute", read);
      window.removeEventListener("deviceorientation", read);
      window.removeEventListener("devicemotion", readMotion);
    },
  };
}
