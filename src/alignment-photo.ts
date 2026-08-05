import { signedAngleDelta } from "./phone-alignment";
import type { SkyState } from "./types";

export type AlignmentPhotoMetadata = {
  includeOverlay: boolean;
  showEclipse: boolean;
  eventLabel: string;
  eventTime: string;
  directionLabel: string;
};

function drawReticle(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
) {
  context.save();
  context.strokeStyle = "rgba(255,247,220,.94)";
  context.lineWidth = Math.max(2, radius * 0.035);
  context.shadowColor = "rgba(255,181,111,.6)";
  context.shadowBlur = radius * 0.22;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.shadowBlur = 0;
  context.beginPath();
  context.moveTo(centerX - radius * 1.35, centerY);
  context.lineTo(centerX + radius * 1.35, centerY);
  context.moveTo(centerX, centerY - radius * 1.35);
  context.lineTo(centerX, centerY + radius * 1.35);
  context.stroke();
  context.restore();
}

function drawEclipse(
  context: CanvasRenderingContext2D,
  state: SkyState,
  centerX: number,
  centerY: number,
  sunRadius: number,
) {
  const degreeScale = sunRadius / (state.sun.angularDiameterDeg / 2);
  const moonRadius = (state.moon.angularDiameterDeg / 2) * degreeScale;
  const azimuthDelta =
    signedAngleDelta(state.sun.azimuthDeg, state.moon.azimuthDeg) *
    Math.cos((state.sun.altitudeDeg * Math.PI) / 180);
  const moonX = centerX + azimuthDelta * degreeScale;
  const moonY =
    centerY - (state.moon.altitudeDeg - state.sun.altitudeDeg) * degreeScale;

  context.save();
  const corona = context.createRadialGradient(
    centerX,
    centerY,
    sunRadius * 0.7,
    centerX,
    centerY,
    sunRadius * 2.5,
  );
  corona.addColorStop(0, "rgba(255,243,204,.82)");
  corona.addColorStop(1, "rgba(255,155,98,0)");
  context.fillStyle = corona;
  context.beginPath();
  context.arc(centerX, centerY, sunRadius * 2.5, 0, Math.PI * 2);
  context.fill();

  const sun = context.createRadialGradient(
    centerX - sunRadius * 0.3,
    centerY - sunRadius * 0.3,
    sunRadius * 0.08,
    centerX,
    centerY,
    sunRadius,
  );
  sun.addColorStop(0, "#fffbd0");
  sun.addColorStop(0.62, "#ffd36a");
  sun.addColorStop(1, "#f58a45");
  context.fillStyle = sun;
  context.beginPath();
  context.arc(centerX, centerY, sunRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#02050b";
  context.beginPath();
  context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawAlignmentPhotoOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: SkyState,
  metadata: AlignmentPhotoMetadata,
) {
  if (!metadata.includeOverlay) return;
  const shortest = Math.min(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const reticleRadius = shortest * 0.075;
  drawReticle(context, centerX, centerY, reticleRadius);
  if (metadata.showEclipse) {
    drawEclipse(context, state, centerX, centerY, shortest * 0.045);
  }

  const padding = shortest * 0.035;
  const titleSize = Math.max(18, shortest * 0.029);
  const detailSize = Math.max(14, shortest * 0.021);
  const panelHeight = padding * 2 + titleSize + detailSize * 2.4;
  context.fillStyle = "rgba(3,10,18,.78)";
  context.fillRect(0, height - panelHeight, width, panelHeight);
  context.fillStyle = "#ffc08c";
  context.font = `700 ${detailSize}px ui-monospace, monospace`;
  context.fillText(
    "ECLIPSE/26 · AR PREVIEW",
    padding,
    height - panelHeight + padding + detailSize,
  );
  context.fillStyle = "#f2f6fc";
  context.font = `600 ${titleSize}px system-ui, sans-serif`;
  context.fillText(
    `${metadata.eventLabel} · ${metadata.directionLabel}`,
    padding,
    height - padding - detailSize * 1.25,
  );
  context.fillStyle = "#c0cddb";
  context.font = `500 ${detailSize}px ui-monospace, monospace`;
  context.fillText(metadata.eventTime, padding, height - padding);
}

export async function captureAlignmentPhoto(
  video: HTMLVideoElement,
  state: SkyState,
  metadata: AlignmentPhotoMetadata,
) {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error("The camera is not ready yet.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo capture is unavailable.");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawAlignmentPhotoOverlay(
    context,
    canvas.width,
    canvas.height,
    state,
    metadata,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The photo could not be created.")),
      "image/jpeg",
      0.92,
    );
  });
}
