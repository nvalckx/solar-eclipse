import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { CITY_CATALOG } from "./city-catalog";
import { calculateSkyState, eclipseWindowFor } from "./eclipse-logic";
import type { ObserverLocation, SkyMode, SkyState } from "./types";
import {
  buildShareUrl,
  LOCATION_STORAGE_KEY,
  parseSharedView,
  parseStoredLocation,
  serializeStoredLocation,
} from "./view-state";
import { LocationDialog } from "./components/LocationDialog";
import { PathDialog } from "./components/PathDialog";
import { ShareDialog } from "./components/ShareDialog";
import { SkyCanvas } from "./components/SkyCanvas";
import { Timeline } from "./components/Timeline";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function readSavedLocation() {
  try {
    return parseStoredLocation(localStorage.getItem(LOCATION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function localDateTime(date: Date, timezone: string, full = false) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    ...(full
      ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
      : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: full ? "2-digit" : undefined,
  }).format(date);
}

function timezoneName(timezone: string, date: Date) {
  return (
    new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timezone
  );
}

function directionFor(azimuth: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(azimuth / 45) % 8
  ];
}

function eventLabel(state: SkyState) {
  if (state.sun.altitudeDeg <= -0.833) return "The Sun is below your horizon";
  if (!state.eclipse.visible) return "Outside the local eclipse phase";
  if (state.eclipse.type === "total") return "Totality — the corona is visible";
  return `${Math.round(state.eclipse.obscurationPercent)}% of the Sun is covered`;
}

function formatDuration(seconds: number | undefined) {
  if (!seconds) return "Not total here";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}

export function App() {
  const initial = useMemo(() => {
    const fallback = readSavedLocation() ?? CITY_CATALOG[0];
    const shared = parseSharedView(window.location.search, fallback);
    const eclipse = eclipseWindowFor(shared.location);
    const min = eclipse.start.getTime() - 30 * 60_000;
    const max = eclipse.end.getTime() + 30 * 60_000;
    return {
      location: shared.location,
      mode: shared.mode,
      nowMs: clamp(
        shared.timestamp?.getTime() ?? eclipse.peak.getTime(),
        min,
        max,
      ),
    };
  }, []);

  const [location, setLocation] = useState(initial.location);
  const [mode, setMode] = useState<SkyMode>(initial.mode);
  const [nowMs, setNowMs] = useState(initial.nowMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [showLocation, setShowLocation] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const [shareFallback, setShareFallback] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const locationButtonRef = useRef<HTMLButtonElement>(null);
  const pathButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);

  const eclipseWindow = useMemo(() => eclipseWindowFor(location), [location]);
  const timeRange = useMemo(
    () => ({
      start: eclipseWindow.start.getTime() - 30 * 60_000,
      end: eclipseWindow.end.getTime() + 30 * 60_000,
    }),
    [eclipseWindow],
  );
  const state = useMemo(
    () => calculateSkyState(new Date(nowMs), location, eclipseWindow),
    [nowMs, location, eclipseWindow],
  );
  const selectedDate = new Date(nowMs);
  const sunDirection = directionFor(state.sun.azimuthDeg);
  const selectedTime = localDateTime(selectedDate, location.timezone, true);
  const zoneName = timezoneName(location.timezone, selectedDate);
  const peakTime = localDateTime(eclipseWindow.peak, location.timezone);
  const isTotalLocation =
    !!eclipseWindow.totalStart && !!eclipseWindow.totalEnd;
  const description = `${mode === "sky" ? "Sky view" : "Magnified close-up"}. ${eventLabel(state)}. Sun altitude ${Math.round(state.sun.altitudeDeg)} degrees, azimuth ${Math.round(state.sun.azimuthDeg)} degrees.`;

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (time: number) => {
      const elapsed = time - previous;
      previous = time;
      setNowMs((value) => {
        const next = value + elapsed * speed;
        if (next >= timeRange.end) {
          setIsPlaying(false);
          return timeRange.end;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, speed, timeRange.end]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LOCATION_STORAGE_KEY,
        serializeStoredLocation(location),
      );
    } catch {
      // Storage is an enhancement; private/locked-down browsers can decline it.
    }
  }, [location]);

  const closeAndRestore = (
    setter: (value: boolean) => void,
    target: RefObject<HTMLButtonElement | null>,
  ) => {
    setter(false);
    requestAnimationFrame(() => target.current?.focus());
  };

  const applyLocation = (next: ObserverLocation) => {
    const nextWindow = eclipseWindowFor(next);
    setLocation(next);
    setNowMs(nextWindow.peak.getTime());
    setIsPlaying(false);
    setShowLocation(false);
    setAnnouncement(
      `Location changed to ${next.label}. Maximum eclipse selected.`,
    );
    requestAnimationFrame(() => locationButtonRef.current?.focus());
  };

  const selectTime = (time: number) => {
    const next = clamp(time, timeRange.start, timeRange.end);
    setNowMs(next);
    setIsPlaying(false);
    setAnnouncement(
      `Selected ${localDateTime(new Date(next), location.timezone, true)}.`,
    );
  };

  const changePlaying = (playing: boolean) => {
    if (playing && nowMs >= timeRange.end) setNowMs(timeRange.start);
    setIsPlaying(playing);
    setAnnouncement(
      playing
        ? `Playback started at ${speed} times speed.`
        : "Playback paused.",
    );
  };

  const handleShare = async () => {
    const url = buildShareUrl(
      window.location.href,
      location,
      selectedDate,
      mode,
    );
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Eclipse/26 view",
          text: `See the 2026 eclipse from ${location.label}`,
          url,
        });
        setAnnouncement("Eclipse view shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setAnnouncement("View link copied to the clipboard.");
    } catch {
      setShareFallback(url);
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#simulator">
        Skip to simulator
      </a>
      <header className="topbar">
        <a className="brand" href="./" aria-label="Eclipse 26 home">
          <span className="brand-mark">◐</span>
          <span>
            ECLIPSE<span>/</span>26
          </span>
        </a>
        <div className="topbar-actions">
          <span className="event-date">12 AUGUST 2026</span>
          <button
            ref={shareButtonRef}
            className="secondary-button"
            data-testid="share-view"
            onClick={handleShare}
          >
            Share view ↗
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <span />
              Interactive eclipse preview
            </p>
            <h1>
              See the <em>shadow</em> arrive.
            </h1>
            <p className="lede">
              Explore how the Moon crosses the Sun from your sky. Choose a
              place, move through the event, and know exactly where to look.
            </p>
            <button
              ref={locationButtonRef}
              className="location-chip"
              data-testid="location-picker"
              aria-haspopup="dialog"
              onClick={() => setShowLocation(true)}
            >
              <span className="pin">⌖</span>
              <span>
                <small>VIEWING FROM</small>
                <strong>{location.label}</strong>
              </span>
              <span aria-hidden="true">Change</span>
            </button>
            <dl className="hero-stats">
              <div>
                <dt>Local maximum</dt>
                <dd>{peakTime}</dd>
                <dd className="stat-note">
                  {timezoneName(location.timezone, eclipseWindow.peak)}
                </dd>
              </div>
              <div>
                <dt>Totality here</dt>
                <dd>{formatDuration(eclipseWindow.totalityDurationSeconds)}</dd>
                <dd className="stat-note">
                  {isTotalLocation
                    ? "Calculated C2–C3"
                    : `${Math.round(eclipseWindow.peakObscuration * 100)}% at maximum`}
                </dd>
              </div>
            </dl>
          </div>

          <section
            className="simulator"
            id="simulator"
            aria-labelledby="simulator-title"
          >
            <header className="simulator-header">
              <div>
                <span className="kicker">AT SELECTED TIME · {zoneName}</span>
                <h2 id="simulator-title">{eventLabel(state)}</h2>
                <p>{selectedTime}</p>
              </div>
              <div className="mode-switch" aria-label="Simulator view">
                <button
                  aria-pressed={mode === "sky"}
                  data-testid="mode-sky"
                  onClick={() => {
                    setMode("sky");
                    setAnnouncement("Sky view selected.");
                  }}
                >
                  Sky
                </button>
                <button
                  aria-pressed={mode === "closeup"}
                  data-testid="mode-closeup"
                  onClick={() => {
                    setMode("closeup");
                    setAnnouncement("Magnified close-up selected.");
                  }}
                >
                  Close-up
                </button>
              </div>
            </header>
            <div className="sky-frame">
              <SkyCanvas state={state} mode={mode} description={description} />
              <div className="scale-note">
                {mode === "closeup"
                  ? "Magnified equally · overlap remains accurate"
                  : "Disks enlarged equally · altitude and bearing are true"}
              </div>
              <div className="sky-readout">
                <span>
                  Sun{" "}
                  <strong>{Math.round(state.sun.altitudeDeg)}° altitude</strong>
                </span>
                <span>
                  Bearing{" "}
                  <strong>
                    {Math.round(state.sun.azimuthDeg)}° {sunDirection}
                  </strong>
                </span>
                <span>
                  Covered{" "}
                  <strong>
                    {Math.round(state.eclipse.obscurationPercent)}%
                  </strong>
                </span>
              </div>
            </div>
            <Timeline
              window={eclipseWindow}
              nowMs={nowMs}
              isPlaying={isPlaying}
              speed={speed}
              formatTime={(date) => localDateTime(date, location.timezone)}
              onTimeChange={selectTime}
              onPlayingChange={changePlaying}
              onSpeedChange={(value) => {
                setSpeed(value);
                setAnnouncement(`Playback speed set to ${value} times.`);
              }}
            />
          </section>
        </section>

        <section className="insight-grid" aria-label="Local eclipse details">
          <article className="info-card circumstances-card">
            <header>
              <span className="kicker">LOCAL CIRCUMSTANCES</span>
              <span
                className={`status-pill ${state.eclipse.visible ? "active" : ""}`}
              >
                AT SELECTED TIME
              </span>
            </header>
            <div className="contact-grid">
              <div>
                <small>C1 · PARTIAL START</small>
                <strong>
                  {localDateTime(eclipseWindow.start, location.timezone)}
                </strong>
              </div>
              {eclipseWindow.totalStart && (
                <div>
                  <small>C2 · TOTALITY START</small>
                  <strong>
                    {localDateTime(eclipseWindow.totalStart, location.timezone)}
                  </strong>
                </div>
              )}
              <div>
                <small>MAXIMUM</small>
                <strong>{peakTime}</strong>
              </div>
              {eclipseWindow.totalEnd && (
                <div>
                  <small>C3 · TOTALITY END</small>
                  <strong>
                    {localDateTime(eclipseWindow.totalEnd, location.timezone)}
                  </strong>
                </div>
              )}
              <div>
                <small>C4 · PARTIAL END</small>
                <strong>
                  {localDateTime(eclipseWindow.end, location.timezone)}
                </strong>
              </div>
            </div>
            <p>
              At maximum, {Math.round(eclipseWindow.peakObscuration * 100)}% of
              the Sun is covered. At the selected time, the Sun is{" "}
              {state.sun.altitudeDeg > -0.833
                ? `${Math.round(state.sun.altitudeDeg)}° above the horizon toward ${sunDirection}`
                : "below your horizon"}
              .
            </p>
          </article>
          <article className="info-card safety-card">
            <span className="card-icon" aria-hidden="true">
              ✺
            </span>
            <div>
              <span className="kicker">LOOK AFTER YOUR EYES</span>
              <h3>
                {state.eclipse.type === "total"
                  ? "Totality at the selected time."
                  : "Use certified eclipse glasses."}
              </h3>
              <p>
                {state.eclipse.type === "total"
                  ? "Only during the brief total phase, when no bright photosphere is visible, may viewers look without eclipse glasses."
                  : "Keep ISO 12312-2 compliant viewers on during every partial phase. Ordinary sunglasses are not safe."}
              </p>
              <a
                href="https://science.nasa.gov/eclipses/safety/"
                target="_blank"
                rel="noreferrer"
              >
                Read NASA safety guidance ↗
              </a>
            </div>
          </article>
          <button
            ref={pathButtonRef}
            className="info-card path-card"
            data-testid="open-map"
            onClick={() => setShowPath(true)}
          >
            <span className="path-art" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <span className="kicker">THE VERIFIED PATH</span>
              <strong>From the Arctic to Spain.</strong>
              <small>
                Explore the totality limits, centerline, UTC timing, and your
                selected place.
              </small>
            </span>
            <b aria-hidden="true">↗</b>
          </button>
        </section>

        <details className="method-card">
          <summary>How this preview works</summary>
          <div>
            <p>
              Sun and Moon positions and local contacts are calculated in your
              browser with Astronomy Engine. The close-up scales both disks and
              their separation together, preserving the visible overlap.
            </p>
            <p>
              Times use your selected IANA time zone. Terrain, clouds,
              atmospheric transparency, and the Moon’s detailed limb profile are
              not modeled, so this is a planning preview rather than navigation
              or safety equipment.
            </p>
          </div>
        </details>
      </main>

      <footer className="footer">
        <span>Calculated locally · no analytics · no location uploads</span>
        <span>
          <a
            href="https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html"
            target="_blank"
            rel="noreferrer"
          >
            NASA GSFC path data
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/cosinekitty/astronomy"
            target="_blank"
            rel="noreferrer"
          >
            Astronomy Engine
          </a>
        </span>
        <span>Built for the sky above you.</span>
      </footer>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {showLocation && (
        <LocationDialog
          current={location}
          onConfirm={applyLocation}
          onClose={() => closeAndRestore(setShowLocation, locationButtonRef)}
        />
      )}
      {showPath && (
        <PathDialog
          location={location}
          onClose={() => closeAndRestore(setShowPath, pathButtonRef)}
        />
      )}
      {shareFallback && (
        <ShareDialog
          url={shareFallback}
          onClose={() => {
            setShareFallback("");
            requestAnimationFrame(() => shareButtonRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
