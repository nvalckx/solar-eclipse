import { useEffect, useRef } from "react";
import type { SkyMode, SkyState } from "../types";

type Props = {
  state: SkyState;
  mode: SkyMode;
  description: string;
  showGolfHole?: boolean;
};

const normalizeAngle = (degrees: number) => ((degrees + 540) % 360) - 180;

export function SkyCanvas({
  state,
  mode,
  description,
  showGolfHole = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const horizon = mode === "sky" ? height * 0.76 : height * 0.9;
      const palette: Record<
        SkyState["twilightLevel"],
        [string, string, string]
      > = {
        day: ["#5f9db4", "#123d5c", "#071626"],
        civil: ["#d67955", "#343252", "#081627"],
        nautical: ["#4e4c89", "#17234d", "#071326"],
        astronomical: ["#26386d", "#101b43", "#060f20"],
        night: ["#12234d", "#07132f", "#030912"],
      };
      const colors = palette[state.twilightLevel];
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.58, colors[1]);
      gradient.addColorStop(1, colors[2]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const dimming = state.eclipse.visible
        ? state.eclipse.obscurationPercent / 100
        : 0;
      if (dimming > 0) {
        context.fillStyle = `rgba(3, 7, 16, ${Math.min(0.68, dimming * 0.58)})`;
        context.fillRect(0, 0, width, height);
      }

      const starOpacity =
        state.twilightLevel === "day" && state.eclipse.obscurationPercent < 88
          ? 0
          : state.twilightLevel === "civil"
            ? 0.24
            : 0.72;
      for (let index = 0; index < 64; index += 1) {
        const x = (index * 109.7) % width;
        const y = 20 + ((index * 61.3) % Math.max(horizon - 40, 1));
        context.fillStyle = `rgba(239, 246, 255, ${(0.25 + (index % 7) / 12) * starOpacity})`;
        context.beginPath();
        context.arc(x, y, 0.55 + (index % 4) * 0.18, 0, Math.PI * 2);
        context.fill();
      }

      const sunRadiusDegrees = state.sun.angularDiameterDeg / 2;
      const moonRadiusDegrees = state.moon.angularDiameterDeg / 2;
      const scale =
        mode === "closeup"
          ? (Math.min(width, height) * 0.17) / sunRadiusDegrees
          : 16 / sunRadiusDegrees;
      const sunPoint =
        mode === "closeup"
          ? { x: width / 2, y: height / 2 }
          : {
              x: width / 2,
              y:
                horizon -
                (Math.max(-8, Math.min(70, state.sun.altitudeDeg)) / 70) *
                  horizon *
                  0.82,
            };
      const azimuthDelta =
        normalizeAngle(state.moon.azimuthDeg - state.sun.azimuthDeg) *
        Math.cos((state.sun.altitudeDeg * Math.PI) / 180);
      const altitudeDelta = state.moon.altitudeDeg - state.sun.altitudeDeg;
      const moonPoint = {
        x: sunPoint.x + azimuthDelta * scale,
        y: sunPoint.y - altitudeDelta * scale,
      };
      const sunRadius = sunRadiusDegrees * scale;
      const moonRadius = moonRadiusDegrees * scale;

      const corona = context.createRadialGradient(
        sunPoint.x,
        sunPoint.y,
        sunRadius * 0.9,
        sunPoint.x,
        sunPoint.y,
        sunRadius * 3.8,
      );
      corona.addColorStop(
        0,
        state.eclipse.type === "total"
          ? "rgba(255,245,218,.98)"
          : "rgba(255,221,152,.56)",
      );
      corona.addColorStop(
        0.22,
        state.eclipse.type === "total"
          ? "rgba(255,218,158,.34)"
          : "rgba(255,164,96,.17)",
      );
      corona.addColorStop(1, "rgba(255,145,84,0)");
      context.fillStyle = corona;
      context.beginPath();
      context.arc(sunPoint.x, sunPoint.y, sunRadius * 3.8, 0, Math.PI * 2);
      context.fill();

      const solar = context.createRadialGradient(
        sunPoint.x - sunRadius * 0.3,
        sunPoint.y - sunRadius * 0.32,
        sunRadius * 0.08,
        sunPoint.x,
        sunPoint.y,
        sunRadius,
      );
      solar.addColorStop(0, "#fffbd0");
      solar.addColorStop(0.62, "#ffd36a");
      solar.addColorStop(1, "#f58a45");
      context.fillStyle = solar;
      context.beginPath();
      context.arc(sunPoint.x, sunPoint.y, sunRadius, 0, Math.PI * 2);
      context.fill();

      if (
        moonPoint.x > -moonRadius &&
        moonPoint.x < width + moonRadius &&
        moonPoint.y > -moonRadius &&
        moonPoint.y < height + moonRadius
      ) {
        context.fillStyle = "#02050b";
        context.beginPath();
        context.arc(moonPoint.x, moonPoint.y, moonRadius, 0, Math.PI * 2);
        context.fill();
        if (state.eclipse.type === "total") {
          context.strokeStyle = "rgba(255, 239, 203, .76)";
          context.lineWidth = Math.max(1, sunRadius * 0.035);
          context.beginPath();
          context.arc(
            moonPoint.x,
            moonPoint.y,
            moonRadius * 1.02,
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
      }

      if (mode === "sky") {
        context.fillStyle = "rgba(2, 7, 15, .95)";
        context.beginPath();
        context.moveTo(0, height);
        context.lineTo(0, horizon + 20);
        for (let x = 0; x <= width; x += 10) {
          context.lineTo(
            x,
            horizon + 20 + Math.sin(x / 47) * 8 + Math.sin(x / 17) * 2.5,
          );
        }
        context.lineTo(width, height);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.25)";
        context.setLineDash([3, 7]);
        context.beginPath();
        context.moveTo(0, horizon);
        context.lineTo(width, horizon);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "rgba(242,247,255,.7)";
        context.font = "600 12px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(
          `${Math.round(state.sun.azimuthDeg)}°`,
          width / 2,
          horizon + 44,
        );

        if (showGolfHole) {
          const flagX = width * 0.72;
          const groundY =
            horizon +
            20 +
            Math.sin(flagX / 47) * 8 +
            Math.sin(flagX / 17) * 2.5;
          const flagTop = groundY - 38;
          context.strokeStyle = "rgba(220, 232, 226, .62)";
          context.lineWidth = 1.5;
          context.beginPath();
          context.moveTo(flagX, flagTop);
          context.lineTo(flagX, groundY);
          context.stroke();
          context.fillStyle = "rgba(255, 190, 112, .78)";
          context.beginPath();
          context.moveTo(flagX, flagTop + 1);
          context.lineTo(flagX + 13, flagTop + 6);
          context.lineTo(flagX, flagTop + 11);
          context.closePath();
          context.fill();
          context.fillStyle = "rgba(220, 232, 226, .72)";
          context.beginPath();
          context.ellipse(flagX, groundY, 7, 2, 0, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode, showGolfHole, state]);

  return (
    <canvas
      ref={canvasRef}
      className="sky-canvas"
      data-golf-hole={showGolfHole && mode === "sky" ? "true" : "false"}
      data-testid="sky-canvas"
      aria-label={
        showGolfHole && mode === "sky"
          ? `${description} A small golf flag marks the landscape.`
          : description
      }
    />
  );
}
