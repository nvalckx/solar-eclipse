import { useEffect, useRef } from "react";
import { MAP_SOURCE } from "../map-data";
import type { ObserverLocation } from "../types";
import { EclipseMap } from "./EclipseMap";

function localTime(timestampMs: number, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestampMs));
}

export function PathDialog({
  location,
  replayTimeMs,
  isPlaying,
  onPlayingChange,
  onRestart,
  onClose,
}: {
  location: ObserverLocation;
  replayTimeMs: number;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="dialog path-dialog"
      aria-labelledby="path-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-card">
        <header className="dialog-header">
          <div>
            <span className="kicker">12 AUGUST 2026 · VERIFIED PATH</span>
            <h2 id="path-dialog-title">Where totality travels</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close path map"
            data-testid="close-map"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="path-map-wrap">
          <EclipseMap location={location} replayTimeMs={replayTimeMs} />
        </div>
        <div className="path-replay-bar">
          <div>
            <span className="kicker">UMBRA POSITION · UTC</span>
            <strong data-testid="path-replay-time">
              {localTime(replayTimeMs, location.timezone)} local ·{" "}
              {new Date(replayTimeMs).toISOString().slice(11, 16)} UTC
            </strong>
          </div>
          <div
            className="path-replay-actions"
            aria-label="Path replay controls"
          >
            <button
              type="button"
              className="path-replay-button"
              data-testid="path-playback"
              aria-label={isPlaying ? "Pause path replay" : "Play path replay"}
              onClick={() => onPlayingChange(!isPlaying)}
            >
              {isPlaying ? "Ⅱ Pause" : "▶ Play"}
            </button>
            <button
              type="button"
              className="path-restart-button"
              data-testid="path-restart"
              onClick={onRestart}
            >
              Restart
            </button>
          </div>
        </div>
        <div className="map-legend">
          <span>
            <i className="legend-band" /> Totality limits
          </span>
          <span>
            <i className="legend-line" /> Centerline
          </span>
          <span>
            <i className="legend-shadow" /> Current umbra
          </span>
          <span>
            <i className="legend-dot" /> Selected place
          </span>
        </div>
        <p className="source-note">
          Path:{" "}
          <a href={MAP_SOURCE.pathUrl} target="_blank" rel="noreferrer">
            {MAP_SOURCE.path}
          </a>
          . Land:{" "}
          <a href={MAP_SOURCE.landUrl} target="_blank" rel="noreferrer">
            {MAP_SOURCE.land}
          </a>
          .
        </p>
      </div>
    </dialog>
  );
}
