export type SphericalDirection = {
  azimuthDeg: number;
  altitudeDeg: number;
};

export type SkyViewState = SphericalDirection & {
  rollDeg: number;
  fovDeg: number;
};

export type GuideMode = "explore" | "sensor" | "ar";

export type SensorCapability = "absolute" | "relative" | "tilt" | "none";

export type Vector3 = readonly [east: number, north: number, up: number];

export type CameraBasis = {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
};

export type ProjectedDirection = {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
};

export const MIN_SKY_FOV = 25;
export const MAX_SKY_FOV = 100;

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;

export const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

export function canonicalizeDirection(
  azimuthDeg: number,
  altitudeDeg: number,
): SphericalDirection {
  let azimuth = azimuthDeg;
  let altitude = ((((altitudeDeg + 180) % 360) + 360) % 360) - 180;
  if (altitude > 90) {
    altitude = 180 - altitude;
    azimuth += 180;
  } else if (altitude < -90) {
    altitude = -180 - altitude;
    azimuth += 180;
  }
  return { azimuthDeg: normalizeDegrees(azimuth), altitudeDeg: altitude };
}

export function directionVector({
  azimuthDeg,
  altitudeDeg,
}: SphericalDirection): Vector3 {
  const azimuth = radians(azimuthDeg);
  const altitude = radians(altitudeDeg);
  const horizontal = Math.cos(altitude);
  return [
    Math.sin(azimuth) * horizontal,
    Math.cos(azimuth) * horizontal,
    Math.sin(altitude),
  ];
}

const dot = (left: Vector3, right: Vector3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

export function cameraBasis(view: SkyViewState): CameraBasis {
  const azimuth = radians(view.azimuthDeg);
  const altitude = radians(view.altitudeDeg);
  const roll = radians(view.rollDeg);
  const forward = directionVector(view);
  const levelRight: Vector3 = [Math.cos(azimuth), -Math.sin(azimuth), 0];
  const levelUp: Vector3 = [
    -Math.sin(azimuth) * Math.sin(altitude),
    -Math.cos(azimuth) * Math.sin(altitude),
    Math.cos(altitude),
  ];
  const cosine = Math.cos(roll);
  const sine = Math.sin(roll);
  return {
    forward,
    right: [
      levelRight[0] * cosine + levelUp[0] * sine,
      levelRight[1] * cosine + levelUp[1] * sine,
      levelRight[2] * cosine + levelUp[2] * sine,
    ],
    up: [
      levelUp[0] * cosine - levelRight[0] * sine,
      levelUp[1] * cosine - levelRight[1] * sine,
      levelUp[2] * cosine - levelRight[2] * sine,
    ],
  };
}

export function projectDirection(
  direction: SphericalDirection,
  view: SkyViewState,
  width: number,
  height: number,
): ProjectedDirection {
  const vector = directionVector(direction);
  const basis = cameraBasis(view);
  const depth = dot(vector, basis.forward);
  const tangentY = Math.tan(radians(view.fovDeg) / 2);
  const tangentX = tangentY * (width / Math.max(height, 1));
  const normalizedX =
    dot(vector, basis.right) / Math.max(depth * tangentX, 1e-9);
  const normalizedY = dot(vector, basis.up) / Math.max(depth * tangentY, 1e-9);
  return {
    x: width * (0.5 + normalizedX * 0.5),
    y: height * (0.5 - normalizedY * 0.5),
    depth,
    visible:
      depth > 0 && Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1,
  };
}

export function projectedAngularRadius(
  angularRadiusDeg: number,
  view: Pick<SkyViewState, "fovDeg">,
  viewportHeight: number,
  depth = 1,
) {
  const angularRadius = radians(clamp(angularRadiusDeg, 0, 89));
  const halfFov = radians(clamp(view.fovDeg, 1, 179) / 2);
  return (
    ((Math.max(viewportHeight, 1) / 2) * Math.tan(angularRadius)) /
    (Math.tan(halfFov) * Math.max(depth, 0.001))
  );
}

export function angularSeparation(
  first: SphericalDirection,
  second: SphericalDirection,
) {
  return degrees(
    Math.acos(
      clamp(dot(directionVector(first), directionVector(second)), -1, 1),
    ),
  );
}

export function edgeIndicator(
  direction: SphericalDirection,
  view: SkyViewState,
  width: number,
  height: number,
) {
  const vector = directionVector(direction);
  const basis = cameraBasis(view);
  const horizontal = dot(vector, basis.right);
  const vertical = dot(vector, basis.up);
  const angle = Math.atan2(vertical, horizontal);
  const radiusX = Math.max(24, width / 2 - 34);
  const radiusY = Math.max(24, height / 2 - 42);
  return {
    x: width / 2 + Math.cos(angle) * radiusX,
    y: height / 2 - Math.sin(angle) * radiusY,
    angleDeg: degrees(angle),
  };
}

export function dragSkyView(
  view: SkyViewState,
  deltaX: number,
  deltaY: number,
  viewportHeight: number,
): SkyViewState {
  const degreesPerPixel = view.fovDeg / Math.max(viewportHeight, 1);
  const direction = canonicalizeDirection(
    view.azimuthDeg - deltaX * degreesPerPixel,
    view.altitudeDeg + deltaY * degreesPerPixel,
  );
  return { ...view, ...direction, rollDeg: 0 };
}

export function zoomSkyView(view: SkyViewState, scale: number): SkyViewState {
  return {
    ...view,
    fovDeg: clamp(view.fovDeg * scale, MIN_SKY_FOV, MAX_SKY_FOV),
  };
}

export function describeDirection(direction: SphericalDirection) {
  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const cardinal =
    cardinals[Math.round(normalizeDegrees(direction.azimuthDeg) / 45) % 8];
  const altitude = Math.round(direction.altitudeDeg);
  return `${Math.round(normalizeDegrees(direction.azimuthDeg))}° ${cardinal}, ${Math.abs(altitude)}° ${altitude >= 0 ? "up" : "below the horizon"}`;
}
