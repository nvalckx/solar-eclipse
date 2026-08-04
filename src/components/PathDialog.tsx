import { useEffect, useRef } from "react";
import { MAP_SOURCE } from "../map-data";
import type { ObserverLocation } from "../types";
import { EclipseMap } from "./EclipseMap";

export function PathDialog({
  location,
  onClose,
}: {
  location: ObserverLocation;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

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
          <EclipseMap location={location} />
        </div>
        <div className="map-legend">
          <span>
            <i className="legend-band" /> Totality limits
          </span>
          <span>
            <i className="legend-line" /> Centerline
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
