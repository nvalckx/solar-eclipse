import { magneticDeclination } from "./magnetic-declination";
import {
  cameraOrientationFromAngles,
  normalizeDegrees,
  type OrientationReading,
} from "./phone-alignment";
import type { ObserverLocation } from "./types";

type PermissionState = "granted" | "denied" | "prompt";

type OrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: (absolute?: boolean) => Promise<PermissionState>;
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
    (values.absolute && !Number.isFinite(values.alpha))
  )
    return null;
  if (!values.absolute && !Number.isFinite(webkitHeading)) return null;
  const alpha = values.absolute
    ? values.alpha!
    : normalizeDegrees(360 - (webkitHeading! + magneticDeclinationDeg));
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
    source: values.absolute ? "absolute" : "webkit-magnetic",
    timestamp,
  };
}

export async function startOrientationSensor(
  location: ObserverLocation,
  onReading: (reading: OrientationReading) => void,
): Promise<OrientationStartResult> {
  if (!window.isSecureContext || !("DeviceOrientationEvent" in window)) {
    return {
      source: "unsupported",
      message: "Motion sensors are unavailable in this browser.",
    };
  }

  const constructor = window.DeviceOrientationEvent as OrientationConstructor;
  try {
    if (typeof constructor.requestPermission === "function") {
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
  } catch {
    return {
      source: "error",
      message: "Motion access could not be started. Use the manual bearing.",
    };
  }

  let receivedAbsolute = false;
  const declination = magneticDeclination(
    location.latitude,
    location.longitude,
    location.elevationMeters,
    new Date(),
  );

  const read = (event: Event) => {
    const orientation = event as WebKitOrientationEvent;
    const isAbsoluteEvent =
      event.type === "deviceorientationabsolute" || orientation.absolute;
    if (isAbsoluteEvent) receivedAbsolute = true;
    if (!isAbsoluteEvent && receivedAbsolute) return;

    const reading = orientationReadingFromEvent(
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
    if (reading) onReading(reading);
  };

  window.addEventListener("deviceorientationabsolute", read);
  window.addEventListener("deviceorientation", read);
  return {
    source: "listening",
    stop: () => {
      window.removeEventListener("deviceorientationabsolute", read);
      window.removeEventListener("deviceorientation", read);
    },
  };
}
