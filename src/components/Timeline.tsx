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
  const totalityLeft = window.totalStart ? position(window.totalStart) : 0;
  const totalityWidth =
    window.totalStart && window.totalEnd
      ? position(window.totalEnd) - totalityLeft
      : 0;

  return (
    <div className="timeline-wrap">
      <div className="timeline-track" aria-hidden="true">
        <span
          className="timeline-progress"
          style={{ "--progress": `${progress}%` } as CSSProperties}
        />
        {window.totalStart && (
          <span
            className="totality-range"
            style={
              {
                "--left": `${totalityLeft}%`,
                "--width": `${totalityWidth}%`,
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
        <button onClick={() => onTimeChange(window.start.getTime())}>
          <small>C1</small>
          {formatTime(window.start)}
        </button>
        {window.totalStart && (
          <button onClick={() => onTimeChange(window.totalStart!.getTime())}>
            <small>C2</small>
            {formatTime(window.totalStart)}
          </button>
        )}
        <button
          data-testid="maximum-time"
          onClick={() => onTimeChange(window.peak.getTime())}
        >
          <small>Maximum</small>
          {formatTime(window.peak)}
        </button>
        {window.totalEnd && (
          <button onClick={() => onTimeChange(window.totalEnd!.getTime())}>
            <small>C3</small>
            {formatTime(window.totalEnd)}
          </button>
        )}
        <button onClick={() => onTimeChange(window.end.getTime())}>
          <small>C4</small>
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
        {window.totalityDurationSeconds && (
          <span className="totality-duration">
            Totality {Math.round(window.totalityDurationSeconds)} sec
          </span>
        )}
      </div>
    </div>
  );
}
