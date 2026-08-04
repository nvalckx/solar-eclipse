import type { PointerEvent } from "react";
import { LAND_PATH, TOTALITY_BAND, TOTALITY_CENTERLINE } from "../map-data";
import type { Coordinate } from "../map-data";
import type { ObserverLocation } from "../types";

const WIDTH = 900;
const HEIGHT = 440;
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
  const [markerX, markerY] = project([location.longitude, location.latitude]);
  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || !onSelect) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    onSelect(90 - (y / HEIGHT) * 180, (x / WIDTH) * 360 - 180);
  };

  return (
    <svg
      className={`eclipse-map ${interactive ? "interactive" : ""} ${compact ? "compact" : ""}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${interactive ? "Selectable world map" : "World map"} showing the verified 2026 path of totality and ${location.label}`}
      onPointerDown={handlePointer}
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
      {TOTALITY_CENTERLINE.filter((_, index) => index % 5 === 0).map((item) => {
        const [x, y] = project(item.coordinate);
        return (
          <g key={item.timeUtc} className="path-time">
            <circle cx={x} cy={y} r={3.5} />
            <text x={x + 7} y={y - 7}>
              {item.timeUtc}
            </text>
          </g>
        );
      })}
      <g className="map-marker" transform={`translate(${markerX} ${markerY})`}>
        <circle r={13} className="marker-pulse" />
        <circle r={5} />
      </g>
    </svg>
  );
}
