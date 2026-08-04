import { useState, type PointerEvent, type WheelEvent } from "react";
import { LAND_PATH, TOTALITY_BAND, TOTALITY_CENTERLINE } from "../map-data";
import type { Coordinate } from "../map-data";
import type { ObserverLocation } from "../types";

const WIDTH = 900;
const HEIGHT = 440;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;
const project = ([longitude, latitude]: Coordinate) =>
  [
    ((longitude + 180) / 360) * WIDTH,
    ((90 - latitude) / 180) * HEIGHT,
  ] as const;

const pathFromCoordinates = (coordinates: Coordinate[], close = false) =>
  `${coordinates
    .map((coordinate, index) => {
      const [x, y] = project(coordinate);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("")}${close ? "Z" : ""}`;

type Props = {
  location: ObserverLocation;
  interactive?: boolean;
  onSelect?: (latitude: number, longitude: number) => void;
  compact?: boolean;
};

export function EclipseMap({
  location,
  interactive = false,
  onSelect,
  compact = false,
}: Props) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [markerX, markerY] = project([location.longitude, location.latitude]);
  const viewBoxWidth = WIDTH / zoom;
  const viewBoxHeight = HEIGHT / zoom;
  const viewBoxX = Math.min(
    WIDTH - viewBoxWidth,
    Math.max(0, markerX - viewBoxWidth / 2),
  );
  const viewBoxY = Math.min(
    HEIGHT - viewBoxHeight,
    Math.max(0, markerY - viewBoxHeight / 2),
  );
  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || !onSelect) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x =
      viewBoxX + ((event.clientX - rect.left) / rect.width) * viewBoxWidth;
    const y =
      viewBoxY + ((event.clientY - rect.top) / rect.height) * viewBoxHeight;
    onSelect(90 - (y / HEIGHT) * 180, (x / WIDTH) * 360 - 180);
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (!interactive) return;
    event.preventDefault();
    setZoom((value) =>
      Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
      ),
    );
  };

  return (
    <div className={`map-visual ${interactive ? "interactive" : ""}`}>
      <svg
        className={`eclipse-map ${interactive ? "interactive" : ""} ${compact ? "compact" : ""}`}
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        role="img"
        aria-label={`${interactive ? "Selectable world map" : "World map"} showing the verified 2026 path of totality and ${location.label}`}
        onPointerDown={handlePointer}
        onWheel={handleWheel}
        data-testid={interactive ? "location-map" : "path-map"}
      >
        <rect width={WIDTH} height={HEIGHT} className="map-ocean" />
        {[90, 180, 270, 360, 450, 540, 630, 720, 810].map((x) => (
          <line
            key={`x-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={HEIGHT}
            className="map-grid"
          />
        ))}
        {[110, 220, 330].map((y) => (
          <line
            key={`y-${y}`}
            x1={0}
            y1={y}
            x2={WIDTH}
            y2={y}
            className="map-grid"
          />
        ))}
        <path d={LAND_PATH} className="map-land" />
        <path
          d={pathFromCoordinates(TOTALITY_BAND, true)}
          className="totality-band"
        />
        <path
          d={pathFromCoordinates(
            TOTALITY_CENTERLINE.map((item) => item.coordinate),
          )}
          className="centerline"
        />
        {TOTALITY_CENTERLINE.filter((_, index) => index % 5 === 0).map(
          (item) => {
            const [x, y] = project(item.coordinate);
            return (
              <g key={item.timeUtc} className="path-time">
                <circle cx={x} cy={y} r={3.5} />
                <text x={x + 7} y={y - 7}>
                  {item.timeUtc}
                </text>
              </g>
            );
          },
        )}
        <g
          className="map-marker"
          transform={`translate(${markerX} ${markerY})`}
        >
          <circle r={13} className="marker-pulse" />
          <circle r={5} />
        </g>
      </svg>
      {interactive && (
        <div className="map-zoom-controls" aria-label="Map zoom controls">
          <button
            type="button"
            aria-label="Zoom in"
            data-testid="location-map-zoom-in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() =>
              setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))
            }
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            data-testid="location-map-zoom-out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() =>
              setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))
            }
          >
            −
          </button>
        </div>
      )}
    </div>
  );
}
