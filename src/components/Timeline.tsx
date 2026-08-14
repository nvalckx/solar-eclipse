import type { EclipseWindow } from "../types";
import type { CSSProperties } from "react";

type Props = {
  window: EclipseWindow;
  nowMs: number;
  isPlaying: boolean;
  speed: number;
  formatTime: (date: Date) => string;
  onTimeChange: (time: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: number) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function Timeline({
  window,
  nowMs,
  isPlaying,
  speed,
  formatTime,
  onTimeChange,
  onPlayingChange,
  onSpeedChange,
}: Props) {
  const start = window.start.getTime() - 30 * 60_000;
  const end = window.end.getTime() + 30 * 60_000;
  const position = (date: Date) =>
    clamp((date.getTime() - start) / (end - start), 0, 1) * 100;
  const progress = clamp((nowMs - start) / (end - start), 0, 1) * 100;
  const centralLeft = window.centralStart ? position(window.centralStart) : 0;
  const centralWidth =
    window.centralStart && window.centralEnd
      ? position(window.centralEnd) - centralLeft
      : 0;
  const centralName =
    window.localType === "annular" ? "Annularity" : "Totality";
  const speedMeaning: Record<number, string> = {
    15: "15 simulated seconds per real second",
    60: "1 simulated minute per real second",
    180: "3 simulated minutes per real second",
  };

  return (
    <div className="timeline-wrap">
      <div className="timeline-track" aria-hidden="true">
        <span
          className="timeline-progress"
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />
        {window.centralStart && (
          <span
            className="totality-range"
            style={
              {
                "--left": `${centralLeft}%`,
                "--width": `${centralWidth}%`,
              } as CSSProperties
            }
          />
        )}
        {[window.start, window.peak, window.end].map((date) => (
          <i
            key={date.toISOString()}
            style={{ "--left": `${position(date)}%` } as CSSProperties}
          />
        ))}
      </div>
      <input
        className="timeline-input"
        aria-label="Eclipse timeline"
        data-testid="eclipse-timeline"
        type="range"
        min={start}
        max={end}
        step={1000}
        value={Math.round(nowMs)}
        onChange={(event) => onTimeChange(Number(event.target.value))}
      />
      <div className="contact-buttons">
        <button
          aria-label={`C1, Partial eclipse begins, ${formatTime(window.start)}`}
          onClick={() => onTimeChange(window.start.getTime())}
        >
          <small>C1 · Partial begins</small>
          {formatTime(window.start)}
        </button>
        {window.centralStart && (
          <button
            aria-label={`C2, ${centralName} begins, ${formatTime(window.centralStart!)}`}
            onClick={() => onTimeChange(window.centralStart!.getTime())}
          >
            <small>C2 · {centralName} begins</small>
            {formatTime(window.centralStart!)}
          </button>
        )}
        <button
          data-testid="maximum-time"
          onClick={() => onTimeChange(window.peak.getTime())}
        >
          <small>Maximum eclipse</small>
          {formatTime(window.peak)}
        </button>
        {window.centralEnd && (
          <button
            aria-label={`C3, ${centralName} ends, ${formatTime(window.centralEnd!)}`}
            onClick={() => onTimeChange(window.centralEnd!.getTime())}
          >
            <small>C3 · {centralName} ends</small>
            {formatTime(window.centralEnd!)}
          </button>
        )}
        <button
          aria-label={`C4, Partial eclipse ends, ${formatTime(window.end)}`}
          onClick={() => onTimeChange(window.end.getTime())}
        >
          <small>C4 · Partial ends</small>
          {formatTime(window.end)}
        </button>
      </div>
      <div className="transport">
        <button
          className="play-button"
          data-testid="playback"
          aria-label={isPlaying ? "Pause playback" : "Play playback"}
          onClick={() => onPlayingChange(!isPlaying)}
        >
          {isPlaying ? "Ⅱ" : "▶"}
        </button>
        <div className="speed-controls" aria-label="Playback speed">
          {[15, 60, 180].map((value) => (
            <button
              aria-pressed={speed === value}
              className={speed === value ? "selected" : ""}
              data-testid={`speed-${value}`}
              key={value}
              onClick={() => onSpeedChange(value)}
            >
              {value}×
            </button>
          ))}
        </div>
        <span className="speed-meaning">
          {speed}× · {speedMeaning[speed]}
        </span>
        {window.centralStart && window.centralEnd && (
          <span className="totality-duration">
            {window.localType === "annular" ? "Annularity" : "Totality"}{" "}
            {Math.round(
              (window.centralEnd.getTime() - window.centralStart.getTime()) /
                1000,
            )}{" "}
            sec
          </span>
        )}
      </div>
    </div>
  );
}
