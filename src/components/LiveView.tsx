import { useMemo } from "react";
import type { EclipseWindow, ObserverLocation } from "../types";
import { calculateSkyState } from "../eclipse-logic";
import { formatCountdown, liveSituation } from "../live-view";
import { EclipseTrajectory } from "./EclipseTrajectory";

type Props = {
  location: ObserverLocation;
  window: EclipseWindow;
  now: Date;
  formatTime: (date: Date, full?: boolean) => string;
  zoneName: string;
  onChangeLocation: (opener: HTMLButtonElement) => void;
  onPreviewTime: (date: Date) => void;
  onOpenSkyGuide: (opener: HTMLElement) => void;
  onConfigureAlerts: (opener: HTMLButtonElement) => void;
  alertsEnabled: boolean;
};

const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function directionFor(azimuth: number) {
  return directions[Math.round(azimuth / 45) % directions.length];
}

export function LiveView({
  location,
  window,
  now,
  formatTime,
  zoneName,
  onChangeLocation,
  onPreviewTime,
  onOpenSkyGuide,
  onConfigureAlerts,
  alertsEnabled,
}: Props) {
  const situation = liveSituation(now, window);
  const currentState = useMemo(
    () => calculateSkyState(now, location, window),
    [location, now, window],
  );
  const previewDate =
    situation.phase === "before"
      ? window.start
      : situation.phase === "after"
        ? window.peak
        : now;
  const guideTargetDate = situation.nextEvent?.time ?? window.peak;
  const guideTarget = useMemo(
    () => calculateSkyState(guideTargetDate, location, window),
    [guideTargetDate, location, window],
  );
  const nextCountdown = situation.nextEvent
    ? formatCountdown(situation.nextEvent.time.getTime() - now.getTime())
    : null;

  return (
    <section className="live-view" aria-labelledby="live-title">
      <header className="live-heading">
        <div>
          <p className="eyebrow">
            <span /> Eclipse-day companion
          </p>
          <h2 id="live-title">
            Follow it <em>live.</em>
          </h2>
          <p>
            Real-time circumstances for {location.label}, with every contact and
            the route the Sun and Moon take through your sky.
          </p>
        </div>
        <div className={`live-phase-badge ${situation.phase}`}>
          <i />
          {situation.phase === "before"
            ? "Countdown"
            : situation.phase === "after"
              ? "Replay ready"
              : "Live now"}
        </div>
      </header>

      <div className="live-layout">
        <article className="live-status-card">
          <div className="live-card-heading">
            <span className="kicker">RIGHT NOW · {zoneName}</span>
            <time dateTime={now.toISOString()} data-testid="live-current-time">
              {formatTime(now, true)}
            </time>
          </div>
          <h3>{situation.title}</h3>
          <p>{situation.detail}</p>
          {situation.nextEvent && nextCountdown && (
            <div className="next-event-timer">
              <span>Until {situation.nextEvent.label}</span>
              <strong data-testid="live-countdown">{nextCountdown}</strong>
              <small>{formatTime(situation.nextEvent.time)}</small>
            </div>
          )}
          <dl className="live-readings">
            <div>
              <dt>Sun now</dt>
              <dd>
                {Math.round(currentState.sun.azimuthDeg)}°{" "}
                {directionFor(currentState.sun.azimuthDeg)}
              </dd>
              <dd className="reading-note">
                {Math.round(currentState.sun.altitudeDeg)}° altitude
              </dd>
            </div>
            <div>
              <dt>Coverage now</dt>
              <dd>{Math.round(currentState.eclipse.obscurationPercent)}%</dd>
              <dd className="reading-note">
                {currentState.eclipse.visible
                  ? currentState.eclipse.type
                  : "Not in progress"}
              </dd>
            </div>
          </dl>
          <div className="live-actions">
            <button
              className="primary-button"
              onClick={() => onPreviewTime(previewDate)}
            >
              {situation.phase === "before"
                ? "Preview first contact"
                : situation.phase === "after"
                  ? "Replay maximum"
                  : "Open now in simulator"}
            </button>
            <button
              className={`secondary-button alert-button ${alertsEnabled ? "active" : ""}`}
              data-testid="open-notifications"
              onClick={(event) => onConfigureAlerts(event.currentTarget)}
            >
              <span aria-hidden="true">◒</span>
              {alertsEnabled ? "Alerts on" : "Set eclipse alerts"}
            </button>
            <button
              className="text-button"
              onClick={(event) => onChangeLocation(event.currentTarget)}
            >
              Change location
            </button>
          </div>
        </article>

        <article
          className="trajectory-card interactive"
          data-testid="sky-trajectory-card"
          data-sky-target-azimuth={Math.round(guideTarget.sun.azimuthDeg)}
          data-sky-target-altitude={Math.round(guideTarget.sun.altitudeDeg)}
          tabIndex={0}
          aria-label="Your sky trajectory. Open the interactive all-sphere sky guide."
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a")) return;
            onOpenSkyGuide(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenSkyGuide(event.currentTarget);
          }}
        >
          <header>
            <div>
              <span className="kicker">YOUR SKY TRAJECTORY</span>
              <h3>From first contact to last light.</h3>
            </div>
            <span className="trajectory-location">{location.label}</span>
          </header>
          <EclipseTrajectory
            location={location}
            window={window}
            now={now}
            formatTime={(date) => formatTime(date)}
            onSelectTime={onPreviewTime}
          />
          <footer className="trajectory-guide-note">
            <span className="trajectory-guide-icon" aria-hidden="true">
              ◎
            </span>
            <div>
              <strong>Explore your view in every direction.</strong>
              <small>
                Open the all-sphere sky guide. Drag with a mouse or trackpad on
                a computer; swipe or follow the compass on a phone.
              </small>
            </div>
            <button
              className="secondary-button"
              data-testid="open-sky-guide"
              onClick={(event) => onOpenSkyGuide(event.currentTarget)}
            >
              Open sky guide <span aria-hidden="true">↗</span>
            </button>
          </footer>
        </article>
      </div>
    </section>
  );
}
