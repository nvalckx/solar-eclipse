import {
  cameraBasis,
  clamp,
  directionVector,
  edgeIndicator,
  type SkyViewState,
  type SphericalDirection,
  type Vector3,
} from "./sky-guide";
import type { SkyGuideScene, SkyGuideTrajectoryPoint } from "./sky-guide-scene";

type RenderOptions = {
  transparent?: boolean;
};

type ScreenPoint = {
  x: number;
  y: number;
  depth: number;
  visible: boolean;
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const dot = (left: Vector3, right: Vector3) =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

function projector(view: SkyViewState, width: number, height: number) {
  const basis = cameraBasis(view);
  const tangentY = Math.tan(radians(view.fovDeg) / 2);
  const tangentX = tangentY * (width / Math.max(height, 1));
  const project = (direction: SphericalDirection): ScreenPoint => {
    const vector = directionVector(direction);
    const depth = dot(vector, basis.forward);
    if (depth <= 0) return { x: 0, y: 0, depth, visible: false };
    const normalizedX = dot(vector, basis.right) / (depth * tangentX);
    const normalizedY = dot(vector, basis.up) / (depth * tangentY);
    return {
      x: width * (0.5 + normalizedX * 0.5),
      y: height * (0.5 - normalizedY * 0.5),
      depth,
      visible: Math.abs(normalizedX) <= 1 && Math.abs(normalizedY) <= 1,
    };
  };
  return { basis, project, tangentX, tangentY };
}

function clipGroundPolygon(
  basis: ReturnType<typeof cameraBasis>,
  tangentX: number,
  tangentY: number,
) {
  type Point = { x: number; y: number; value: number };
  const value = (x: number, y: number) =>
    basis.forward[2] +
    x * tangentX * basis.right[2] +
    y * tangentY * basis.up[2];
  let polygon: Point[] = [
    { x: -1, y: -1, value: value(-1, -1) },
    { x: 1, y: -1, value: value(1, -1) },
    { x: 1, y: 1, value: value(1, 1) },
    { x: -1, y: 1, value: value(-1, 1) },
  ];
  const clipped: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = current.value <= 0;
    const previousInside = previous.value <= 0;
    if (currentInside !== previousInside) {
      const fraction = previous.value / (previous.value - current.value);
      const x = previous.x + (current.x - previous.x) * fraction;
      const y = previous.y + (current.y - previous.y) * fraction;
      clipped.push({ x, y, value: 0 });
    }
    if (currentInside) clipped.push(current);
  }
  polygon = clipped;
  return polygon;
}

function strokeDirections(
  context: CanvasRenderingContext2D,
  directions: SphericalDirection[],
  project: (direction: SphericalDirection) => ScreenPoint,
  strokeStyle: string,
  lineWidth = 1,
  dash: number[] = [],
) {
  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.setLineDash(dash);
  context.beginPath();
  let drawing = false;
  let previous: ScreenPoint | null = null;
  for (const direction of directions) {
    const point = project(direction);
    const continuous =
      point.depth > 0 &&
      previous?.depth &&
      Math.hypot(point.x - previous.x, point.y - previous.y) < 300;
    if (!continuous) {
      drawing = false;
    } else if (!drawing && previous) {
      context.moveTo(previous.x, previous.y);
      drawing = true;
    }
    if (drawing) context.lineTo(point.x, point.y);
    previous = point;
  }
  context.stroke();
  context.restore();
}

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyGuideScene,
  view: SkyViewState,
  basis: ReturnType<typeof cameraBasis>,
  tangentX: number,
  tangentY: number,
) {
  const palettes = {
    day: ["#72aec2", "#174663"],
    civil: ["#b66f58", "#18284c"],
    nautical: ["#4f5388", "#101d45"],
    astronomical: ["#293d70", "#091631"],
    night: ["#122650", "#030a18"],
  } as const;
  const [top, bottom] = palettes[scene.state.twilightLevel];
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  if (scene.state.eclipse.visible) {
    context.fillStyle = `rgba(2, 5, 14, ${Math.min(0.62, scene.state.eclipse.obscurationPercent * 0.0052)})`;
    context.fillRect(0, 0, width, height);
  }

  const ground = clipGroundPolygon(basis, tangentX, tangentY);
  if (ground.length) {
    context.beginPath();
    ground.forEach((point, index) => {
      const x = ((point.x + 1) / 2) * width;
      const y = ((1 - point.y) / 2) * height;
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    context.closePath();
    const groundGradient = context.createLinearGradient(0, 0, 0, height);
    groundGradient.addColorStop(0, "rgba(7, 20, 29, .88)");
    groundGradient.addColorStop(1, "rgba(1, 6, 12, .98)");
    context.fillStyle = groundGradient;
    context.fill();
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.28)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  if (view.altitudeDeg < -70) {
    context.fillStyle = "rgba(226, 236, 245, .48)";
    context.font = "700 11px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("BELOW YOUR FEET", width / 2, height - 28);
  }
}

function drawGrid(
  context: CanvasRenderingContext2D,
  project: (direction: SphericalDirection) => ScreenPoint,
) {
  for (const altitude of [-60, -30, 0, 30, 60]) {
    strokeDirections(
      context,
      Array.from({ length: 145 }, (_, index) => ({
        azimuthDeg: index * 2.5,
        altitudeDeg: altitude,
      })),
      project,
      altitude === 0 ? "rgba(255, 212, 154, .7)" : "rgba(225, 238, 250, .16)",
      altitude === 0 ? 1.5 : 1,
      altitude === 0 ? [] : [3, 8],
    );
  }
  for (let azimuth = 0; azimuth < 360; azimuth += 30) {
    strokeDirections(
      context,
      Array.from({ length: 73 }, (_, index) => ({
        azimuthDeg: azimuth,
        altitudeDeg: -90 + index * 2.5,
      })),
      project,
      "rgba(225, 238, 250, .13)",
      1,
      [3, 8],
    );
  }

  const labels = [
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
  ] as const;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const [azimuthDeg, label] of labels) {
    const point = project({ azimuthDeg, altitudeDeg: 2 });
    if (!point.visible) continue;
    context.fillStyle = label === "N" ? "#ffad76" : "rgba(238,245,252,.82)";
    context.font = "700 13px ui-monospace, monospace";
    context.fillText(label, point.x, point.y);
  }
  for (const [altitudeDeg, label] of [
    [90, "ZENITH"],
    [-90, "NADIR"],
  ] as const) {
    const point = project({ azimuthDeg: 0, altitudeDeg });
    if (!point.visible) continue;
    context.fillStyle = "rgba(238,245,252,.64)";
    context.font = "700 10px ui-monospace, monospace";
    context.fillText(label, point.x, point.y);
  }
}

function drawStars(
  context: CanvasRenderingContext2D,
  scene: SkyGuideScene,
  project: (direction: SphericalDirection) => ScreenPoint,
) {
  const opacity =
    scene.state.twilightLevel === "day"
      ? scene.state.eclipse.obscurationPercent >= 88
        ? 0.42
        : 0
      : scene.state.twilightLevel === "civil"
        ? 0.28
        : 0.78;
  if (!opacity) return;
  for (const star of scene.stars) {
    const point = project(star);
    if (!point.visible) continue;
    const radius = clamp(2.5 - star.magnitude * 0.55, 0.8, 3.3);
    context.fillStyle = `rgba(245, 249, 255, ${opacity})`;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    if (star.magnitude <= 0.5) {
      context.fillStyle = `rgba(238, 245, 252, ${opacity * 0.75})`;
      context.font = "500 10px ui-monospace, monospace";
      context.textAlign = "left";
      context.fillText(star.name, point.x + 7, point.y - 7);
    }
  }
}

function drawTrajectory(
  context: CanvasRenderingContext2D,
  scene: SkyGuideScene,
  project: (direction: SphericalDirection) => ScreenPoint,
) {
  strokeDirections(
    context,
    scene.trajectory,
    project,
    "rgba(255, 166, 104, .82)",
    2,
    [5, 5],
  );
  for (const point of scene.trajectory.filter(
    (item): item is SkyGuideTrajectoryPoint & { key: string; label: string } =>
      !!item.key && !!item.label,
  )) {
    const projected = project(point);
    if (!projected.visible) continue;
    context.fillStyle = "#ffad76";
    context.beginPath();
    context.arc(projected.x, projected.y, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255, 232, 211, .9)";
    context.font = "700 9px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText(point.key, projected.x, projected.y - 11);
  }
}

function drawSunAndMoon(
  context: CanvasRenderingContext2D,
  height: number,
  scene: SkyGuideScene,
  view: SkyViewState,
  project: (direction: SphericalDirection) => ScreenPoint,
) {
  const sun = project(scene.state.sun);
  const moon = project(scene.state.moon);
  const physicalSunRadius =
    (scene.state.sun.angularDiameterDeg / 2 / view.fovDeg) * height;
  const enlargement = Math.max(1, 15 / Math.max(physicalSunRadius, 0.1));
  const sunRadius = physicalSunRadius * enlargement;
  const moonRadius =
    (scene.state.moon.angularDiameterDeg / 2 / view.fovDeg) *
    height *
    enlargement;

  if (sun.visible) {
    const glow = context.createRadialGradient(
      sun.x,
      sun.y,
      sunRadius * 0.4,
      sun.x,
      sun.y,
      sunRadius * 3.7,
    );
    glow.addColorStop(0, "rgba(255, 244, 202, .88)");
    glow.addColorStop(0.25, "rgba(255, 181, 103, .28)");
    glow.addColorStop(1, "rgba(255, 151, 91, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(sun.x, sun.y, sunRadius * 3.7, 0, Math.PI * 2);
    context.fill();
    const disk = context.createRadialGradient(
      sun.x - sunRadius * 0.3,
      sun.y - sunRadius * 0.3,
      sunRadius * 0.08,
      sun.x,
      sun.y,
      sunRadius,
    );
    disk.addColorStop(0, "#fffbd0");
    disk.addColorStop(0.62, "#ffd36a");
    disk.addColorStop(1, "#f58a45");
    context.fillStyle = disk;
    context.beginPath();
    context.arc(sun.x, sun.y, sunRadius, 0, Math.PI * 2);
    context.fill();
  }
  if (moon.visible) {
    context.fillStyle = "#02050b";
    context.strokeStyle = "rgba(226, 235, 245, .45)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(moon.x, moon.y, Math.max(2, moonRadius), 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  if (sun.visible) {
    context.strokeStyle = scene.targetObservable ? "#fff1b8" : "#ff9d77";
    context.lineWidth = 1.5;
    context.setLineDash([4, 5]);
    context.beginPath();
    context.arc(sun.x, sun.y, Math.max(28, sunRadius * 2), 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "rgba(255, 244, 224, .94)";
    context.font = "700 10px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText(
      scene.targetLabel,
      sun.x,
      sun.y + Math.max(43, sunRadius * 2.8),
    );
  }
}

function drawOffscreenTarget(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyGuideScene,
  view: SkyViewState,
  project: (direction: SphericalDirection) => ScreenPoint,
) {
  if (project(scene.target).visible) return;
  const edge = edgeIndicator(scene.target, view, width, height);
  context.save();
  context.translate(edge.x, edge.y);
  context.rotate(-radians(edge.angleDeg));
  context.fillStyle = scene.targetObservable ? "#ffbd83" : "#ff8f73";
  context.beginPath();
  context.moveTo(13, 0);
  context.lineTo(-8, -8);
  context.lineTo(-8, 8);
  context.closePath();
  context.fill();
  context.restore();
  context.fillStyle = "rgba(255, 239, 218, .92)";
  context.font = "700 9px ui-monospace, monospace";
  context.textAlign = edge.x < width / 2 ? "left" : "right";
  context.fillText(
    scene.targetObservable ? "TARGET" : "BELOW HORIZON",
    edge.x + (edge.x < width / 2 ? 16 : -16),
    edge.y + 3,
  );
}

export function drawSkyGuideScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SkyGuideScene,
  view: SkyViewState,
  options: RenderOptions = {},
) {
  context.clearRect(0, 0, width, height);
  const { basis, project, tangentX, tangentY } = projector(view, width, height);
  if (!options.transparent) {
    drawBackground(
      context,
      width,
      height,
      scene,
      view,
      basis,
      tangentX,
      tangentY,
    );
  }
  drawGrid(context, project);
  drawStars(context, scene, project);
  drawTrajectory(context, scene, project);
  drawSunAndMoon(context, height, scene, view, project);
  drawOffscreenTarget(context, width, height, scene, view, project);

  context.fillStyle = "rgba(238, 245, 252, .58)";
  context.font = "600 9px ui-monospace, monospace";
  context.textAlign = "left";
  context.fillText(
    `FOV ${Math.round(clamp(view.fovDeg, 1, 180))}° · CELESTIAL DISKS ENLARGED EQUALLY`,
    12,
    height - 12,
  );
}
