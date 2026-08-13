import { useEffect, useMemo, useRef, useState } from "react";
import { FEATURED_CITY_CATALOG } from "../city-catalog";
import { isValidLocation, isValidTimezone } from "../eclipse-logic";
import { searchPlaces, timezoneAt } from "../place-catalog";
import type {
  EclipsePathData,
  EclipseRecord,
  ObserverLocation,
} from "../types";
import { EclipseMap } from "./EclipseMap";

type Props = {
  current: ObserverLocation;
  event: EclipseRecord;
  path?: EclipsePathData;
  onConfirm: (location: ObserverLocation) => void;
  onClose: () => void;
};

const formatCoordinate = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;

function parseCoordinatePair(value: string) {
  const match = value
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)\s*(?:,|;|\s)\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return isValidLocation(latitude, longitude) ? { latitude, longitude } : null;
}

function timezoneOptions() {
  try {
    const intl = Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

export function LocationDialog({
  current,
  event,
  path,
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(current);
  const [query, setQuery] = useState("");
  const [coordinatePaste, setCoordinatePaste] = useState("");
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState(FEATURED_CITY_CATALOG);
  const [searching, setSearching] = useState(false);
  const zones = useMemo(timezoneOptions, []);

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setSuggestions(FEATURED_CITY_CATALOG);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(query).then((places) => {
        if (!active) return;
        setSuggestions(places);
        setSearching(false);
      });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

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

  const updateCoordinates = (latitude: number, longitude: number) => {
    const lat = Number(latitude.toFixed(4));
    const lon = Number(longitude.toFixed(4));
    setDraft((value) => ({
      ...value,
      latitude: lat,
      longitude: lon,
      elevationMeters: 0,
      label: `${formatCoordinate(lat, "N", "S")} · ${formatCoordinate(lon, "E", "W")}`,
      source: "coordinates",
    }));
    setMessage("Coordinates selected. Finding the local time zone…");
    void timezoneAt(lat, lon)
      .then((timezone) => {
        setDraft((value) => ({ ...value, timezone }));
        setMessage(`Coordinates selected · ${timezone}.`);
      })
      .catch(() =>
        setMessage(
          "Coordinates selected. Confirm the time zone before applying.",
        ),
      );
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Geolocation is not available in this browser.");
      return;
    }
    setMessage("Locating you…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevationMeters: position.coords.altitude ?? 0,
          label: "Your location",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          source: "geolocation",
        });
        setMessage("Location found. Check the time zone, then apply.");
      },
      (error) => {
        setMessage(
          error.code === error.TIMEOUT
            ? "Location lookup timed out. Choose a featured place or enter coordinates."
            : "Location access was denied. Choose a featured place or enter coordinates.",
        );
      },
      { enableHighAccuracy: false, timeout: 9000 },
    );
  };

  const valid =
    isValidLocation(draft.latitude, draft.longitude) &&
    isValidTimezone(draft.timezone);
  const pastedCoordinates = parseCoordinatePair(coordinatePaste);

  return (
    <dialog
      ref={dialogRef}
      className="dialog location-dialog"
      aria-labelledby="location-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      data-testid="location-dialog"
    >
      <div className="dialog-card">
        <header className="dialog-header">
          <div>
            <span className="kicker">PRIVATE · ON THIS DEVICE</span>
            <h2 id="location-dialog-title">Set your sky</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close location picker"
            data-testid="close-location-picker"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="location-layout">
          <section>
            <button
              className="location-action"
              data-testid="use-my-location"
              onClick={useMyLocation}
            >
              ◎ Use my current location
            </button>
            <div className="map-wrap">
              <EclipseMap
                location={draft}
                event={event}
                path={path}
                interactive
                onSelect={updateCoordinates}
                compact
              />
              <span>Tap the map to choose coordinates</span>
            </div>
            <div className="coordinate-grid">
              <label>
                Latitude
                <input
                  type="number"
                  min={-90}
                  max={90}
                  step="0.0001"
                  value={draft.latitude}
                  onChange={(event) =>
                    updateCoordinates(
                      Number(event.target.value),
                      draft.longitude,
                    )
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step="0.0001"
                  value={draft.longitude}
                  onChange={(event) =>
                    updateCoordinates(
                      draft.latitude,
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>
            <div className="coordinate-paste-row">
              <label>
                Paste coordinate pair
                <input
                  value={coordinatePaste}
                  inputMode="decimal"
                  placeholder="52.3676, 4.9041"
                  onChange={(event) => setCoordinatePaste(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !pastedCoordinates) return;
                    event.preventDefault();
                    updateCoordinates(
                      pastedCoordinates.latitude,
                      pastedCoordinates.longitude,
                    );
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!pastedCoordinates}
                onClick={() => {
                  if (!pastedCoordinates) return;
                  updateCoordinates(
                    pastedCoordinates.latitude,
                    pastedCoordinates.longitude,
                  );
                }}
              >
                Use coordinates
              </button>
            </div>
            <label className="timezone-field">
              Time zone
              <input
                list="timezones"
                value={draft.timezone}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    timezone: event.target.value,
                  }))
                }
                aria-describedby="timezone-help"
              />
            </label>
            <datalist id="timezones">
              <option value="UTC" />
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <small id="timezone-help">
              Used only to display contact times. For map pins, confirm this
              matches the selected place.
            </small>
            {message && (
              <p className="dialog-status" role="status" aria-live="polite">
                {message}
              </p>
            )}
          </section>
          <section className="featured-places">
            <label className="search-field">
              Search places worldwide
              <input
                data-testid="city-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Natural Earth places…"
              />
            </label>
            <div className="place-list">
              {suggestions.map((place) => (
                <button
                  key={place.label}
                  className="place-result"
                  data-testid={`place-${place.label}`}
                  onClick={() => onConfirm(place)}
                >
                  <span>{place.label}</span>
                  <small>{formatCoordinate(place.latitude, "N", "S")}</small>
                </button>
              ))}
              {searching && <p className="dialog-status">Searching places…</p>}
              {!searching && !suggestions.length && (
                <p className="empty-state" role="status">
                  No featured match. Choose a point on the map or enter
                  coordinates.
                </p>
              )}
            </div>
          </section>
        </div>
        <footer className="dialog-actions">
          <button className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!valid}
            data-testid="apply-location"
            onClick={() => onConfirm(draft)}
          >
            Apply location
          </button>
        </footer>
      </div>
    </dialog>
  );
}
