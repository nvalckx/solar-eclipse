import { useEffect, useRef } from "react";
import { drawSkyScene } from "../sky-scene";
import type { SkyMode, SkyState } from "../types";

type Props = {
  state: SkyState;
  mode: SkyMode;
  description: string;
  showGolfHole?: boolean;
};

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
      drawSkyScene(context, rect.width, rect.height, state, mode, showGolfHole);
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
