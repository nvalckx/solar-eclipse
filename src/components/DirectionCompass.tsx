import type { CSSProperties } from "react";
import type { HorizontalPosition } from "../types";

type Props = {
  sun: HorizontalPosition;
  moon: HorizontalPosition;
};

const directionFor = (azimuth: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(azimuth / 45) % 8
  ];

function markerStyle(azimuth: number, radius: number): CSSProperties {
  const angle = (azimuth * Math.PI) / 180;
  return {
    left: `calc(50% + ${Math.sin(angle) * radius}px)`,
    top: `calc(50% - ${Math.cos(angle) * radius}px)`,
  };
}

function positionLabel(name: string, position: HorizontalPosition) {
  const altitude = Math.round(position.altitudeDeg);
  return [
    name,
    `${Math.round(position.azimuthDeg)} degrees`,
    directionFor(position.azimuthDeg),
    `${altitude} degrees`,
    altitude >= 0 ? "above" : "below",
    "the horizon",
  ].join(" ");
}

export function DirectionCompass({ sun, moon }: Props) {
  const accessibilityLabel = [
    "Direction compass.",
    `${positionLabel("Sun", sun)}.`,
    `${positionLabel("Moon", moon)}.`,
  ].join(" ");
  const sunMarkerClass =
    sun.altitudeDeg < 0
      ? "compass-marker compass-sun below-horizon"
      : "compass-marker compass-sun";
  const moonMarkerClass =
    moon.altitudeDeg < 0
      ? "compass-marker compass-moon below-horizon"
      : "compass-marker compass-moon";

  return (
    <div
      className="direction-compass"
      data-testid="direction-compass"
      role="img"
      aria-label={accessibilityLabel}
    >
      <span className="compass-kicker">LOOK TOWARD</span>
      <div className="compass-dial" aria-hidden="true">
        <span className="compass-cardinal compass-north">N</span>
        <span className="compass-cardinal compass-east">E</span>
        <span className="compass-cardinal compass-south">S</span>
        <span className="compass-cardinal compass-west">W</span>
        <span className="compass-center" />
        <span
          className={sunMarkerClass}
          style={markerStyle(sun.azimuthDeg, 38)}
          title={positionLabel("Sun", sun)}
        >
          ☀
        </span>
        <span
          className={moonMarkerClass}
          style={markerStyle(moon.azimuthDeg, 38)}
          title={positionLabel("Moon", moon)}
        >
          ☾
        </span>
      </div>
      <div className="compass-legend" aria-hidden="true">
        <span>
          <i className="compass-legend-sun" />
          Sun{" "}
          <b>
            {Math.round(sun.azimuthDeg)}° {directionFor(sun.azimuthDeg)}
          </b>
        </span>
        <span>
          <i className="compass-legend-moon" />
          Moon{" "}
          <b>
            {Math.round(moon.azimuthDeg)}° {directionFor(moon.azimuthDeg)}
          </b>
        </span>
      </div>
    </div>
  );
}
