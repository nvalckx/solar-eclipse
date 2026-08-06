import type { SensorCapability } from "./sky-guide";

export type OrientationSource =
  "absolute" | "webkit-magnetic" | "relative" | "tilt";

export type OrientationQuaternion = readonly [
  x: number,
  y: number,
  z: number,
  w: number,
];

export type OrientationReading = {
  headingDeg: number;
  altitudeDeg: number;
  rollDeg: number;
  accuracyDeg?: number;
  source: OrientationSource;
  capability?: SensorCapability;
  quaternion?: OrientationQuaternion;
  timestamp: number;
};

export type AlignmentQuality = "good" | "approximate" | "poor";

export type AlignmentGuidance = {
  headingDeltaDeg: number;
  altitudeDeltaDeg: number;
  quality: AlignmentQuality;
  aligned: boolean;
  instruction: string;
};

export type AlignmentMarkerPosition = {
  leftPercent: number;
  topPercent: number;
  inFinder: boolean;
};

export const normalizeDegrees = (degrees: number) =>
  ((degrees % 360) + 360) % 360;

export const signedAngleDelta = (fromDeg: number, toDeg: number) =>
  ((toDeg - fromDeg + 540) % 360) - 180;

export function cameraOrientationFromAngles(
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
  screenAngleDeg = 0,
) {
  const toRadians = Math.PI / 180;
  const alpha = alphaDeg * toRadians;
  const beta = betaDeg * toRadians;
  const gamma = gammaDeg * toRadians;
  const sinA = Math.sin(alpha);
  const cosA = Math.cos(alpha);
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  const sinG = Math.sin(gamma);
  const cosG = Math.cos(gamma);

  // Rear camera optical axis [0, 0, -1] transformed using the W3C
  // intrinsic Z-X'-Y'' device-orientation rotation order.
  const east = -cosA * sinG - sinA * sinB * cosG;
  const north = -sinA * sinG + cosA * sinB * cosG;
  const up = -cosB * cosG;
  const headingDeg = normalizeDegrees(
    (Math.atan2(east, north) * 180) / Math.PI,
  );
  const altitudeDeg =
    (Math.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI;
  const rollDeg = signedAngleDelta(0, gammaDeg + screenAngleDeg);
  return {
    headingDeg,
    altitudeDeg,
    rollDeg,
    quaternion: cameraQuaternion(headingDeg, altitudeDeg, rollDeg),
  };
}

export function cameraQuaternion(
  headingDeg: number,
  altitudeDeg: number,
  rollDeg: number,
): OrientationQuaternion {
  const halfHeading = (headingDeg * Math.PI) / 360;
  const halfAltitude = (-altitudeDeg * Math.PI) / 360;
  const halfRoll = (rollDeg * Math.PI) / 360;
  const cy = Math.cos(halfHeading);
  const sy = Math.sin(halfHeading);
  const cp = Math.cos(halfAltitude);
  const sp = Math.sin(halfAltitude);
  const cr = Math.cos(halfRoll);
  const sr = Math.sin(halfRoll);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy,
  ];
}

export function cameraOrientationFromAcceleration(
  x: number,
  y: number,
  z: number,
  headingDeg: number,
  screenAngleDeg = 0,
) {
  const screen = (screenAngleDeg * Math.PI) / 180;
  const screenX = x * Math.cos(screen) - y * Math.sin(screen);
  const screenY = x * Math.sin(screen) + y * Math.cos(screen);
  const altitudeDeg =
    (Math.atan2(z, Math.hypot(screenX, screenY)) * 180) / Math.PI;
  const rollDeg = (Math.atan2(screenX, screenY) * 180) / Math.PI;
  return {
    headingDeg: normalizeDegrees(headingDeg),
    altitudeDeg,
    rollDeg,
    quaternion: cameraQuaternion(headingDeg, altitudeDeg, rollDeg),
  };
}

export function circularJitter(headings: number[]) {
  if (headings.length < 2) return 0;
  const radians = headings.map((heading) => (heading * Math.PI) / 180);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0);
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0);
  const length = Math.sqrt(x * x + y * y) / radians.length;
  return (
    Math.sqrt(Math.max(0, -2 * Math.log(Math.max(length, 0.000_001)))) *
    (180 / Math.PI)
  );
}

export function smoothReading(
  previous: OrientationReading | null,
  next: OrientationReading,
  factor = 0.22,
): OrientationReading {
  if (!previous) return next;
  const headingDeg = normalizeDegrees(
    previous.headingDeg +
      signedAngleDelta(previous.headingDeg, next.headingDeg) * factor,
  );
  const altitudeDeg =
    previous.altitudeDeg + (next.altitudeDeg - previous.altitudeDeg) * factor;
  const rollDeg =
    previous.rollDeg +
    signedAngleDelta(previous.rollDeg, next.rollDeg) * factor;
  return {
    ...next,
    headingDeg,
    altitudeDeg,
    rollDeg,
    quaternion: cameraQuaternion(headingDeg, altitudeDeg, rollDeg),
  };
}

export function alignmentGuidance(
  reading: OrientationReading,
  target: { azimuthDeg: number; altitudeDeg: number },
  jitterDeg: number,
): AlignmentGuidance {
  const headingDeltaDeg = signedAngleDelta(
    reading.headingDeg,
    target.azimuthDeg,
  );
  const altitudeDeltaDeg = target.altitudeDeg - reading.altitudeDeg;
  const accuracy = reading.accuracyDeg ?? 8;
  const quality: AlignmentQuality =
    accuracy > 15 || jitterDeg > 8
      ? "poor"
      : accuracy > 10 || jitterDeg > 4
        ? "approximate"
        : "good";
  const direction =
    Math.abs(headingDeltaDeg) > 3
      ? `Turn ${headingDeltaDeg > 0 ? "right" : "left"}`
      : Math.abs(altitudeDeltaDeg) > 3
        ? `Tilt ${altitudeDeltaDeg > 0 ? "up" : "down"}`
        : quality === "good"
          ? "Aligned with the event"
          : "Approximately aligned — calibrate compass";
  return {
    headingDeltaDeg,
    altitudeDeltaDeg,
    quality,
    aligned:
      quality === "good" &&
      Math.abs(headingDeltaDeg) <= 3 &&
      Math.abs(altitudeDeltaDeg) <= 3,
    instruction: direction,
  };
}

export function alignmentMarkerPosition(
  guidance: Pick<AlignmentGuidance, "headingDeltaDeg" | "altitudeDeltaDeg">,
  horizontalFinderDeg = 70,
  verticalFinderDeg = 50,
): AlignmentMarkerPosition {
  const halfHorizontal = horizontalFinderDeg / 2;
  const halfVertical = verticalFinderDeg / 2;
  const horizontalRatio = Math.max(
    -1,
    Math.min(1, guidance.headingDeltaDeg / halfHorizontal),
  );
  const verticalRatio = Math.max(
    -1,
    Math.min(1, guidance.altitudeDeltaDeg / halfVertical),
  );
  return {
    leftPercent: 50 + horizontalRatio * 40,
    topPercent: 50 - verticalRatio * 40,
    inFinder:
      Math.abs(guidance.headingDeltaDeg) <= halfHorizontal &&
      Math.abs(guidance.altitudeDeltaDeg) <= halfVertical,
  };
}
