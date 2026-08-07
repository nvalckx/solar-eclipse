import { drawSkyScene } from "./sky-scene";
import type { EclipseWindow, SkyMode, SkyState } from "./types";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

export type ShareCardSnapshot = {
  label: string;
  time: string;
  state: SkyState;
  isPeak?: boolean;
};

export type ShareCardModel = {
  state: SkyState;
  eclipseWindow: EclipseWindow;
  mode: SkyMode;
  snapshots: readonly ShareCardSnapshot[];
  locationLabel: string;
  selectedDate: Date;
  selectedTime: string;
  zoneName: string;
  eventLabel: string;
  peakTime: string;
  totalityDurationLabel: string;
};

const sans = '"Space Grotesk Variable", "Segoe UI", sans-serif';
const mono = 'Consolas, "Liberation Mono", monospace';

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function truncateText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  if (context.measureText(value).width <= maxWidth) return value;
  let text = value;
  while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth)
    text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

function renderScene(state: SkyState, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  drawSkyScene(context, width, height, state, "closeup");
  return canvas;
}

function drawSnapshot(
  context: CanvasRenderingContext2D,
  snapshot: ShareCardSnapshot,
  x: number,
  y: number,
  radius: number,
) {
  if (snapshot.isPeak) {
    const glow = context.createRadialGradient(
      x,
      y,
      radius * 0.25,
      x,
      y,
      radius * 1.7,
    );
    glow.addColorStop(0, "rgba(255, 214, 155, .36)");
    glow.addColorStop(1, "rgba(255, 147, 102, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 1.7, 0, Math.PI * 2);
    context.fill();
  }

  const scene = renderScene(snapshot.state, radius * 2, radius * 2);
  context.save();
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.clip();
  context.drawImage(scene, x - radius, y - radius);
  context.restore();

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.strokeStyle = snapshot.isPeak
    ? "#ffb486"
    : "rgba(255, 240, 205, .78)";
  context.lineWidth = snapshot.isPeak ? 4 : 2;
  context.stroke();
}

function drawBrand(context: CanvasRenderingContext2D) {
  context.fillStyle = "#ff9366";
  context.beginPath();
  context.arc(53, 45, 9, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#06101c";
  context.beginPath();
  context.arc(58, 45, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f2f6fc";
  context.font = `700 17px ${sans}`;
  context.fillText("ECLIPSE", 76, 51);
  context.fillStyle = "#ff9366";
  context.fillText("/", 159, 51);
  context.fillStyle = "#f2f6fc";
  context.fillText("26", 173, 51);
  context.fillStyle = "#9fb0c2";
  context.font = `600 12px ${mono}`;
  context.textAlign = "right";
  context.fillText("12 AUGUST 2026", 1148, 50);
  context.textAlign = "left";
}

function drawShareCard(
  context: CanvasRenderingContext2D,
  model: ShareCardModel,
) {
  const eventSummary =
    model.state.sun.altitudeDeg <= -0.833
      ? "SUN BELOW HORIZON"
      : model.state.eclipse.type === "total"
        ? "TOTALITY"
        : model.state.eclipse.visible
          ? `${Math.round(model.state.eclipse.obscurationPercent)}% COVERED`
          : "ECLIPSE VIEW";
  const background = context.createRadialGradient(980, 20, 40, 720, 260, 940);
  background.addColorStop(0, "#234c68");
  background.addColorStop(0.46, "#0a1b2b");
  background.addColorStop(1, "#040b13");
  context.fillStyle = background;
  context.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  context.fillStyle = "rgba(255, 147, 102, .08)";
  context.beginPath();
  context.arc(1010, 30, 300, 0, Math.PI * 2);
  context.fill();
  drawBrand(context);

  context.fillStyle = "#ffb486";
  context.font = `700 11px ${mono}`;
  context.fillText("YOUR ECLIPSE VIEW", 48, 104);
  context.fillStyle = "#f5f8fc";
  context.font = `650 39px ${sans}`;
  context.fillText(truncateText(context, model.locationLabel, 720), 48, 148);
  context.fillStyle = "#b8c7d7";
  context.font = `500 17px ${sans}`;
  context.fillText(
    truncateText(
      context,
      `${eventSummary} · ${model.selectedTime} ${model.zoneName}`,
      1080,
    ),
    48,
    177,
  );

  const positions = [
    { x: 145, y: 347, radius: 69 },
    { x: 370, y: 322, radius: 83 },
    { x: 600, y: 290, radius: 106 },
    { x: 830, y: 322, radius: 83 },
    { x: 1055, y: 347, radius: 69 },
  ];
  const snapshots = model.snapshots.slice(0, positions.length);

  context.strokeStyle = "rgba(255, 147, 102, .48)";
  context.lineWidth = 3;
  context.lineCap = "round";
  context.beginPath();
  positions.slice(0, snapshots.length).forEach((position, index) => {
    if (index === 0) context.moveTo(position.x, position.y);
    else context.lineTo(position.x, position.y);
  });
  context.stroke();
  context.lineCap = "butt";

  snapshots.forEach((snapshot, index) => {
    const position = positions[index];
    drawSnapshot(context, snapshot, position.x, position.y, position.radius);
    context.textAlign = "center";
    context.fillStyle = snapshot.isPeak ? "#ffb486" : "#bdcad8";
    context.font = `700 11px ${mono}`;
    context.fillText(
      snapshot.label,
      position.x,
      position.y + position.radius + 21,
    );
    context.fillStyle = snapshot.isPeak ? "#f5f8fc" : "#8295aa";
    context.font = `600 11px ${mono}`;
    context.fillText(
      snapshot.time,
      position.x,
      position.y + position.radius + 39,
    );
  });
  context.textAlign = "left";

  context.fillStyle = "#8295aa";
  context.font = `600 12px ${mono}`;
  context.fillText(
    model.eclipseWindow.totalityDurationSeconds
      ? `MAX ${model.peakTime} · TOTALITY ${model.totalityDurationLabel}`
      : `MAX ${model.peakTime} · ${Math.round(model.eclipseWindow.peakObscuration * 100)}% COVERED`,
    48,
    488,
  );

  roundRectPath(context, 36, 548, 1128, 54, 15);
  const callToAction = context.createLinearGradient(36, 548, 1164, 602);
  callToAction.addColorStop(0, "#ff9366");
  callToAction.addColorStop(1, "#ffc08c");
  context.fillStyle = callToAction;
  context.fill();
  context.fillStyle = "#07101c";
  context.font = `700 16px ${sans}`;
  context.fillText("Open the interactive eclipse view", 60, 582);
  context.font = `700 17px ${mono}`;
  context.textAlign = "right";
  context.fillText("EXPLORE YOUR SKY  →", 1138, 583);
  context.textAlign = "left";
}

export function shareCardFilename(model: ShareCardModel) {
  const place =
    model.locationLabel
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "view";
  const timestamp = model.selectedDate
    .toISOString()
    .replace(/:\d{2}\.\d{3}Z$/, "Z")
    .replace(/[:T]/g, "-")
    .replace(/Z$/, "");
  return `eclipse-26-${place}-${timestamp}.png`;
}

export async function createShareCard(model: ShareCardModel) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");
  drawShareCard(context, model);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The share image could not be created."));
    }, "image/png");
  });
}
