import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import {
  describeDirection,
  dragSkyView,
  zoomSkyView,
  type SkyViewState,
} from "../sky-guide";
import { drawSkyGuideScene } from "../sky-guide-renderer";
import type { SkyGuideScene } from "../sky-guide-scene";

type Props = {
  scene: SkyGuideScene;
  view: SkyViewState;
  transparent?: boolean;
  onViewChange: (view: SkyViewState) => void;
  onExplore: () => void;
};

type PointerPosition = { x: number; y: number };

export function SkySphereCanvas({
  scene,
  view,
  transparent = false,
  onViewChange,
  onExplore,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const pinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(rect.width * dpr);
      const pixelHeight = Math.round(rect.height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSkyGuideScene(context, rect.width, rect.height, scene, view, {
        transparent,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [scene, transparent, view]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    onExplore();
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, current);
    const pointers = [...pointersRef.current.values()];
    if (pointers.length === 1) {
      pinchDistanceRef.current = null;
      onViewChange(
        dragSkyView(
          view,
          current.x - previous.x,
          current.y - previous.y,
          event.currentTarget.clientHeight,
        ),
      );
      return;
    }
    const distance = Math.hypot(
      pointers[0].x - pointers[1].x,
      pointers[0].y - pointers[1].y,
    );
    const previousDistance = pinchDistanceRef.current;
    pinchDistanceRef.current = distance;
    if (previousDistance && distance > 1) {
      onViewChange(zoomSkyView(view, previousDistance / distance));
    }
  };

  const releasePointer = (event: PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = null;
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    onExplore();
    onViewChange(zoomSkyView(view, event.deltaY < 0 ? 0.88 : 1.12));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const largeStep = event.shiftKey ? 15 : 5;
    let next = view;
    if (event.key === "ArrowLeft")
      next = dragSkyView(view, largeStep, 0, view.fovDeg);
    else if (event.key === "ArrowRight")
      next = dragSkyView(view, -largeStep, 0, view.fovDeg);
    else if (event.key === "ArrowUp")
      next = dragSkyView(view, 0, -largeStep, view.fovDeg);
    else if (event.key === "ArrowDown")
      next = dragSkyView(view, 0, largeStep, view.fovDeg);
    else if (event.key === "+" || event.key === "=")
      next = zoomSkyView(view, 0.85);
    else if (event.key === "-" || event.key === "_")
      next = zoomSkyView(view, 1.15);
    else return;
    event.preventDefault();
    onExplore();
    onViewChange(next);
  };

  return (
    <canvas
      ref={canvasRef}
      className="sky-sphere-canvas"
      data-testid="sky-sphere-canvas"
      data-heading={Math.round(view.azimuthDeg)}
      data-altitude={Math.round(view.altitudeDeg)}
      data-fov={Math.round(view.fovDeg)}
      data-scene-time={scene.state.timestampUtc}
      data-sun-trajectory-points={scene.sunTrajectory.length}
      data-moon-trajectory-points={scene.moonTrajectory.length}
      tabIndex={0}
      role="img"
      aria-label={`Interactive all-sphere sky map with full 360 degree dashed Sun and Moon trajectories. View ${describeDirection(view)}. Selected ${scene.targetLabel}: ${describeDirection(scene.target)}.`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
    />
  );
}
