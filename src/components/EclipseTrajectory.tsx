import { useMemo } from "react";
import type { EclipseWindow, ObserverLocation } from "../types";
import { calculateSkyState } from "../eclipse-logic";
import { eclipseEvents } from "../live-view";

type Props = {
  location: ObserverLocation;
  window: EclipseWindow;
  now: Date;
  formatTime: (date: Date) => string;
  onSelectTime: (date: Date) => void;
};

const WIDTH = 760;
const HEIGHT = 250;
const PLOT_LEFT = 38;
const PLOT_RIGHT = 18;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 42;

export function EclipseTrajectory({
  location,
  window,
  now,
  formatTime,
  onSelectTime,
}: Props) {
  const { points, altitudeMin, altitudeMax } = useMemo(() => {
    const samples = Array.from({ length: 49 }, (_, index) => {
      const fraction = index / 48;
      const time = new Date(
        window.start.getTime() +
          fraction * (window.end.getTime() - window.start.getTime()),
      );
      return { time, state: calculateSkyState(time, location, window) };
    });
    const altitudes = samples.flatMap((sample) => [
      sample.state.sun.altitudeDeg,
      sample.state.moon.altitudeDeg,
    ]);
    return {
      points: samples,
      altitudeMin: Math.floor(Math.min(...altitudes) / 5) * 5 - 2,
      altitudeMax: Math.ceil(Math.max(...altitudes) / 5) * 5 + 2,
    };
  }, [location, window]);

  const xFor = (date: Date) =>
    PLOT_LEFT +
    ((date.getTime() - window.start.getTime()) /
      (window.end.getTime() - window.start.getTime())) *
      (WIDTH - PLOT_LEFT - PLOT_RIGHT);
  const yFor = (altitude: number) =>
    PLOT_TOP +
    ((altitudeMax - altitude) / (altitudeMax - altitudeMin)) *
      (HEIGHT - PLOT_TOP - PLOT_BOTTOM);
  const pathFor = (body: "sun" | "moon") =>
    points
      .map((point, index) => {
        const position = point.state[body];
        return `${index ? "L" : "M"}${xFor(point.time).toFixed(1)},${yFor(position.altitudeDeg).toFixed(1)}`;
      })
      .join(" ");
  const events = eclipseEvents(window);
  const currentX = xFor(now);
  const showCurrent =
    now.getTime() >= window.start.getTime() &&
    now.getTime() <= window.end.getTime();

  return (
    <div className="trajectory-wrap">
      <svg
        className="trajectory-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Sun and Moon altitude trajectories from first to fourth contact"
      >
        <defs>
          <linearGradient id="sun-path-glow" x1="0" x2="1">
            <stop offset="0" stopColor="#ff9366" />
            <stop offset="0.55" stopColor="#fff0b8" />
            <stop offset="1" stopColor="#ff9366" />
          </linearGradient>
        </defs>
        {[altitudeMin, (altitudeMin + altitudeMax) / 2, altitudeMax].map(
          (altitude) => (
            <g key={altitude}>
              <line
                className="trajectory-gridline"
                x1={PLOT_LEFT}
                x2={WIDTH - PLOT_RIGHT}
                y1={yFor(altitude)}
                y2={yFor(altitude)}
              />
              <text
                className="trajectory-axis-label"
                x={PLOT_LEFT - 7}
                y={yFor(altitude) + 4}
                textAnchor="end"
              >
                {Math.round(altitude)}°
              </text>
            </g>
          ),
        )}
        <path className="trajectory-moon" d={pathFor("moon")} />
        <path className="trajectory-sun" d={pathFor("sun")} />
        {events.map((event) => {
          const eventState = calculateSkyState(event.time, location, window);
          const x = xFor(event.time);
          const y = yFor(eventState.sun.altitudeDeg);
          return (
            <g className="trajectory-event" key={event.key}>
              <line x1={x} x2={x} y1={y + 7} y2={HEIGHT - PLOT_BOTTOM} />
              <circle cx={x} cy={y} r="5" />
              <text x={x} y={HEIGHT - 17} textAnchor="middle">
                {event.key}
              </text>
            </g>
          );
        })}
        {showCurrent && (
          <g className="trajectory-now">
            <line
              x1={currentX}
              x2={currentX}
              y1={PLOT_TOP - 7}
              y2={HEIGHT - PLOT_BOTTOM}
            />
            <text x={currentX} y={13} textAnchor="middle">
              NOW
            </text>
          </g>
        )}
      </svg>
      <div className="trajectory-legend" aria-hidden="true">
        <span>
          <i className="legend-sun-line" /> Sun altitude
        </span>
        <span>
          <i className="legend-moon-line" /> Moon altitude
        </span>
      </div>
      <div className="live-event-list" aria-label="Eclipse event times">
        {events.map((event) => {
          const difference = event.time.getTime() - now.getTime();
          const state = difference > 0 ? "upcoming" : "past";
          return (
            <button
              className={state}
              data-testid={`live-event-${event.key.toLowerCase()}`}
              key={event.key}
              onClick={() => onSelectTime(event.time)}
            >
              <span className="event-code">{event.key}</span>
              <span>
                <strong>{event.label}</strong>
                <small>{formatTime(event.time)}</small>
              </span>
              <span className="event-relative">
                {difference > 0 ? formatCountdownShort(difference) : "Passed"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatCountdownShort(milliseconds: number) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `in ${days}d ${hours}h`;
  if (hours) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}
