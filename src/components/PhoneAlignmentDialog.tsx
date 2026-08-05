import { useEffect, useMemo, useRef, useState } from "react";
import { calculateSkyState, eclipseWindowFor } from "../eclipse-logic";
import { eclipseEvents, type EclipseEventKey } from "../live-view";
import {
  alignmentGuidance,
  circularJitter,
  smoothReading,
  type OrientationReading,
} from "../phone-alignment";
import {
  startOrientationSensor,
  type OrientationController,
} from "../orientation-sensor";
import type { ObserverLocation } from "../types";
import { EclipseDiskOverlay } from "./EclipseDiskOverlay";

type Stage = "setup" | "requesting" | "active" | "paused";

type Props = {
  location: ObserverLocation;
  now: Date;
  formatTime: (date: Date, full?: boolean) => string;
  onLocationChange: (location: ObserverLocation) => void;
  onClose: () => void;
};

const directionFor = (azimuth: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(azimuth / 45) % 8];

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function PhoneAlignmentDialog({
  location,
  now,
  formatTime,
  onLocationChange,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const orientationRef = useRef<OrientationController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const smoothedRef = useRef<OrientationReading | null>(null);
  const headingsRef = useRef<number[]>([]);
  const publishTimeRef = useRef(0);
  const [sessionLocation, setSessionLocation] = useState(location);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState(
    "Location not verified for this session.",
  );
  const [locating, setLocating] = useState(false);
  const [stage, setStage] = useState<Stage>("setup");
  const [selectedEvent, setSelectedEvent] = useState<EclipseEventKey>("MAX");
  const [followLive, setFollowLive] = useState(true);
  const [reading, setReading] = useState<OrientationReading | null>(null);
  const [jitter, setJitter] = useState(0);
  const [sensorMessage, setSensorMessage] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [hasCamera, setHasCamera] = useState(false);

  const window = useMemo(
    () => eclipseWindowFor(sessionLocation),
    [sessionLocation],
  );
  const events = useMemo(() => eclipseEvents(window), [window]);
  const liveAvailable = now >= window.start && now <= window.end;
  const selected =
    events.find((event) => event.key === selectedEvent) ??
    events.find((event) => event.key === "MAX")!;
  const targetTime = followLive && liveAvailable ? now : selected.time;
  const targetState = useMemo(
    () => calculateSkyState(targetTime, sessionLocation, window),
    [sessionLocation, targetTime, window],
  );
  const observable = targetState.sun.altitudeDeg > -0.833;
  const guidance = reading
    ? alignmentGuidance(reading, targetState.sun, jitter)
    : null;
  const showCalibration = guidance?.quality === "poor";
  const manual =
    stage === "active" &&
    !reading &&
    !!sensorMessage &&
    sensorMessage !== "Waiting for a compass reading…";

  const cleanupSensors = () => {
    orientationRef.current?.stop();
    orientationRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setHasCamera(false);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      orientationRef.current?.stop();
      stopStream(streamRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    if (!videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      setCameraMessage(
        "Camera preview could not play; sensor guide remains active.",
      );
      setHasCamera(false);
    });
  }, [hasCamera]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden || stage !== "active") return;
      cleanupSensors();
      setStage("paused");
      setSensorMessage(
        "Alignment paused while the page was in the background.",
      );
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  });

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "Phone location is unavailable. You can continue with the selected place.",
      );
      return;
    }
    setLocating(true);
    setLocationMessage("Finding this phone’s location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: ObserverLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          elevationMeters: position.coords.altitude ?? 0,
          label: "Your current location",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          source: "geolocation",
        };
        setSessionLocation(next);
        setLocationAccuracy(position.coords.accuracy);
        setLocationMessage(
          `Phone location refreshed · accurate to about ${Math.round(position.coords.accuracy)} m.`,
        );
        setLocating(false);
        onLocationChange(next);
      },
      (error) => {
        setLocationMessage(
          error.code === error.TIMEOUT
            ? "Location timed out. You can continue with the selected place."
            : "Location access was denied. You can continue with the selected place.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  };

  const startAlignment = async () => {
    if (!observable) return;
    cleanupSensors();
    smoothedRef.current = null;
    headingsRef.current = [];
    setReading(null);
    setJitter(0);
    setStage("requesting");
    setSensorMessage("Waiting for a compass reading…");
    setCameraMessage("");

    const orientationPromise = startOrientationSensor(
      sessionLocation,
      (next) => {
        const smoothed = smoothReading(smoothedRef.current, next);
        smoothedRef.current = smoothed;
        headingsRef.current = [
          ...headingsRef.current.slice(-19),
          next.headingDeg,
        ];
        if (next.timestamp - publishTimeRef.current < 60) return;
        publishTimeRef.current = next.timestamp;
        setReading(smoothed);
        setJitter(circularJitter(headingsRef.current));
        setSensorMessage("");
      },
    );
    const cameraPromise = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      : Promise.reject(new Error("Camera unavailable"));

    const [orientationResult, cameraResult] = await Promise.allSettled([
      orientationPromise,
      cameraPromise,
    ]);
    if (orientationResult.status === "fulfilled") {
      if (orientationResult.value.source === "listening") {
        orientationRef.current = orientationResult.value;
        globalThis.setTimeout(() => {
          if (!smoothedRef.current)
            setSensorMessage(
              "No absolute compass reading arrived. Use the manual bearing.",
            );
        }, 2200);
      } else {
        setSensorMessage(orientationResult.value.message);
      }
    } else {
      setSensorMessage("Motion access failed. Use the manual bearing.");
    }
    if (cameraResult.status === "fulfilled") {
      streamRef.current = cameraResult.value;
      cameraResult.value.getVideoTracks().forEach((track) => {
        track.addEventListener(
          "ended",
          () => {
            setHasCamera(false);
            setCameraMessage(
              "Camera preview stopped; the sensor guide remains active.",
            );
          },
          { once: true },
        );
      });
      setHasCamera(true);
    } else {
      setCameraMessage("Camera unavailable; using the simulated sky finder.");
    }
    setStage("active");
  };

  const close = () => {
    cleanupSensors();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="alignment-dialog"
      aria-labelledby="alignment-title"
      data-testid="phone-alignment-dialog"
    >
      <div className="alignment-shell">
        <header className="alignment-header">
          <div>
            <span className="kicker">PRIVATE · ON THIS DEVICE</span>
            <h2 id="alignment-title">Phone sky guide</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close phone alignment"
            data-testid="close-phone-alignment"
            onClick={close}
          >
            ×
          </button>
        </header>

        {stage === "setup" ? (
          <main className="alignment-setup">
            <section className="alignment-intro">
              <span className="kicker">PREVIEW BEFORE 12 AUGUST</span>
              <h3>Stand where you’ll watch. See where to look.</h3>
              <p>
                Your phone’s compass and tilt sensors will guide you to the
                position of maximum eclipse, or any local contact you choose.
              </p>
            </section>
            <section className="alignment-setup-card">
              <span className="kicker">VIEWING POSITION</span>
              <strong>{sessionLocation.label}</strong>
              <small>
                {sessionLocation.latitude.toFixed(4)}°,{" "}
                {sessionLocation.longitude.toFixed(4)}°
                {locationAccuracy !== null
                  ? ` · ±${Math.round(locationAccuracy)} m`
                  : ""}
              </small>
              <p role="status">{locationMessage}</p>
              <button
                className="location-action"
                data-testid="refresh-alignment-location"
                disabled={locating}
                onClick={refreshLocation}
              >
                {locating ? "Locating…" : "◎ Refresh phone location"}
              </button>
            </section>
            <section className="alignment-safety">
              <span aria-hidden="true">☀</span>
              <div>
                <strong>Protect your eyes and camera.</strong>
                <p>
                  Never look at the bright Sun through a camera. Camera optics
                  need a proper front-mounted solar filter during partial
                  phases; eclipse glasses do not protect the camera lens.
                </p>
                <a
                  href="https://science.nasa.gov/eclipses/safety/"
                  target="_blank"
                  rel="noreferrer"
                >
                  NASA eclipse safety ↗
                </a>
              </div>
            </section>
            <div className="alignment-setup-actions">
              <button
                className="primary-button"
                data-testid="begin-phone-alignment"
                disabled={!observable}
                onClick={startAlignment}
              >
                Start alignment
              </button>
              <small>Camera and motion permissions are requested next.</small>
            </div>
            {!observable && (
              <p className="alignment-error" role="alert">
                Maximum eclipse is below the horizon here. Choose another
                contact or location.
              </p>
            )}
          </main>
        ) : (
          <main
            className={`alignment-active ${hasCamera ? "has-camera" : "sensor-only"}`}
          >
            <div className="alignment-viewport">
              {hasCamera && (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  data-testid="alignment-camera"
                  aria-label="Rear camera preview"
                />
              )}
              <div className="alignment-sky-backdrop" aria-hidden="true" />
              <div className="alignment-safety-strip">
                <strong>
                  Solar filter required for camera optics during partial phases.
                </strong>
                <span>Never use this guide as eye protection.</span>
              </div>
              <nav
                className="alignment-events"
                aria-label="Alignment target time"
              >
                {liveAvailable && (
                  <button
                    data-testid="alignment-event-live"
                    aria-pressed={followLive}
                    onClick={() => setFollowLive(true)}
                  >
                    <small>LIVE</small> Now
                  </button>
                )}
                {events.map((event) => {
                  const eventVisible =
                    calculateSkyState(event.time, sessionLocation, window).sun
                      .altitudeDeg > -0.833;
                  return (
                    <button
                      key={event.key}
                      data-testid={`alignment-event-${event.key.toLowerCase()}`}
                      aria-pressed={
                        (!followLive || !liveAvailable) &&
                        selected.key === event.key
                      }
                      disabled={!eventVisible}
                      title={
                        eventVisible
                          ? event.label
                          : `${event.label} is below the local horizon`
                      }
                      onClick={() => {
                        setSelectedEvent(event.key);
                        setFollowLive(false);
                      }}
                    >
                      <small>{event.key}</small> {formatTime(event.time)}
                    </button>
                  );
                })}
              </nav>

              <div
                className="alignment-target"
                data-quality={guidance?.quality ?? "manual"}
              >
                {guidance && Math.abs(guidance.headingDeltaDeg) > 3 && (
                  <span
                    className={`alignment-turn ${guidance.headingDeltaDeg > 0 ? "right" : "left"}`}
                  >
                    {guidance.headingDeltaDeg > 0 ? "→" : "←"}
                    <small>
                      {Math.round(Math.abs(guidance.headingDeltaDeg))}°
                    </small>
                  </span>
                )}
                {guidance && Math.abs(guidance.altitudeDeltaDeg) > 3 && (
                  <span
                    className={`alignment-tilt ${guidance.altitudeDeltaDeg > 0 ? "up" : "down"}`}
                  >
                    {guidance.altitudeDeltaDeg > 0 ? "↑" : "↓"}
                    <small>
                      {Math.round(Math.abs(guidance.altitudeDeltaDeg))}°
                    </small>
                  </span>
                )}
                <span className="alignment-crosshair" aria-hidden="true" />
                {manual && (
                  <span className="manual-compass" aria-hidden="true">
                    <b>N</b>
                    <i
                      style={{
                        transform: `translateX(-50%) rotate(${targetState.sun.azimuthDeg}deg)`,
                      }}
                    />
                  </span>
                )}
                <EclipseDiskOverlay
                  state={targetState}
                  visible={observable && (guidance?.aligned === true || manual)}
                />
              </div>

              <div className="alignment-instruction" aria-live="polite">
                <span
                  className={`alignment-quality ${guidance?.quality ?? "manual"}`}
                >
                  {guidance?.quality === "good"
                    ? "Compass ready"
                    : guidance?.quality === "approximate"
                      ? "Approximate heading"
                      : guidance?.quality === "poor"
                        ? "Calibration needed"
                        : "Manual guide"}
                </span>
                <h3>
                  {!observable
                    ? "This moment is below your horizon"
                    : stage === "requesting"
                      ? "Starting phone sensors…"
                      : (guidance?.instruction ??
                        "Use the bearing shown below")}
                </h3>
                <p>
                  Target {Math.round(targetState.sun.azimuthDeg)}°{" "}
                  {directionFor(targetState.sun.azimuthDeg)} ·{" "}
                  {Math.round(targetState.sun.altitudeDeg)}° up
                </p>
                <time dateTime={targetTime.toISOString()}>
                  {followLive && liveAvailable ? "Live now" : selected.label} ·{" "}
                  {formatTime(targetTime, true)}
                </time>
                <small>
                  Sun and Moon disks enlarged equally; direction and overlap are
                  calculated.
                </small>
              </div>
            </div>

            <aside className="alignment-status-panel">
              {showCalibration && (
                <div className="calibration-card" role="status">
                  <strong>Calibrate your compass</strong>
                  <p>
                    Move away from metal, then sweep the phone in a slow
                    figure-eight.
                  </p>
                </div>
              )}
              {sensorMessage && (
                <p className="alignment-notice">{sensorMessage}</p>
              )}
              {cameraMessage && (
                <p className="alignment-notice">{cameraMessage}</p>
              )}
              {stage === "paused" && (
                <button className="primary-button" onClick={startAlignment}>
                  Resume alignment
                </button>
              )}
              {!followLive && liveAvailable && (
                <button
                  className="text-button"
                  onClick={() => setFollowLive(true)}
                >
                  Return to live
                </button>
              )}
            </aside>
          </main>
        )}
      </div>
    </dialog>
  );
}
