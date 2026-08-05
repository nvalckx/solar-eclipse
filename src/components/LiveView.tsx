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
  onStartAlignment: (opener: HTMLButtonElement) => void;
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
  onStartAlignment,
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
  const arTargetDate = situation.nextEvent?.time ?? window.peak;
  const arTarget = useMemo(
    () => calculateSkyState(arTargetDate, location, window),
    [arTargetDate, location, window],
  );
  const nextCountdown = situation.nextEvent
    ? formatCountdown(situation.nextEvent.time.getTime() - now.getTime())
    : null;

  return (
    <section className="live-view" id="live" aria-labelledby="live-title">
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
              className="text-button"
              onClick={(event) => onChangeLocation(event.currentTarget)}
            >
              Change location
            </button>
          </div>
        </article>

        <article className="trajectory-card">
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
        </article>

        <article
          className="ar-ready-card"
          data-ar-target-azimuth={Math.round(arTarget.sun.azimuthDeg)}
          data-ar-target-altitude={Math.round(arTarget.sun.altitudeDeg)}
        >
          <div className="ar-phone" aria-hidden="true">
            <span className="ar-horizon" />
            <span className="ar-reticle">
              <i />
            </span>
            <span className="ar-bearing">
              {Math.round(arTarget.sun.azimuthDeg)}°{" "}
              {directionFor(arTarget.sun.azimuthDeg)}
            </span>
            <span className="ar-altitude">
              {Math.round(arTarget.sun.altitudeDeg)}° up
            </span>
          </div>
          <div className="ar-copy">
            <span className="kicker">PHONE SKY GUIDE · CAMERA + COMPASS</span>
            <h3>Point your phone. Find the Sun.</h3>
            <p>
              Check your viewing direction before eclipse day, or follow the
              event live. Your phone’s camera, compass, and tilt sensors guide
              the reticle to the calculated position in your sky.
            </p>
            <dl className="ar-target-readout">
              <div>
                <dt>Target event</dt>
                <dd>{situation.nextEvent?.label ?? "Maximum eclipse"}</dd>
              </div>
              <div>
                <dt>Point toward</dt>
                <dd>
                  {Math.round(arTarget.sun.azimuthDeg)}°{" "}
                  {directionFor(arTarget.sun.azimuthDeg)}
                </dd>
              </div>
              <div>
                <dt>Tilt up</dt>
                <dd>{Math.round(arTarget.sun.altitudeDeg)}°</dd>
              </div>
            </dl>
            <button
              className="secondary-button"
              data-testid="start-phone-alignment"
              onClick={(event) => onStartAlignment(event.currentTarget)}
            >
              Start phone alignment
            </button>
            <small className="ar-note">
              Permissions are requested only after you start. A manual guide is
              always available.
            </small>
          </div>
        </article>
      </div>
    </section>
  );
}
