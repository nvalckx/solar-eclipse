import { useEffect, useMemo, useRef, useState } from "react";
import { calculateSkyState, eclipseWindowFor } from "../eclipse-logic";
import { eclipseEvents, type EclipseEventKey } from "../live-view";
import {
  alignmentGuidance,
  alignmentMarkerPosition,
  circularJitter,
  normalizeDegrees,
  smoothReading,
  type OrientationReading,
} from "../phone-alignment";
import {
  startOrientationSensor,
  type OrientationController,
} from "../orientation-sensor";
import type { ObserverLocation } from "../types";
import { EclipseDiskOverlay } from "./EclipseDiskOverlay";
import { captureAlignmentPhoto } from "../alignment-photo";

type Stage = "setup" | "requesting" | "active" | "paused";
type NavigationMode = "sensor" | "manual";

type CapturedPhoto = {
  blob: Blob;
  url: string;
  includeOverlay: boolean;
  filename: string;
};

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
  const capturedUrlRef = useRef<string | null>(null);
  const sensorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
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
  const [cameraReady, setCameraReady] = useState(false);
  const [navigationMode, setNavigationMode] =
    useState<NavigationMode>("sensor");
  const [manualHeading, setManualHeading] = useState(0);
  const [includePhotoOverlay, setIncludePhotoOverlay] = useState(true);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(
    null,
  );
  const [photoMessage, setPhotoMessage] = useState("");

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
  const sensorGuidance = reading
    ? alignmentGuidance(reading, targetState.sun, jitter)
    : null;
  const manual = stage === "active" && navigationMode === "manual";
  const guidance = manual
    ? alignmentGuidance(
        {
          headingDeg: manualHeading,
          altitudeDeg: targetState.sun.altitudeDeg,
          rollDeg: 0,
          accuracyDeg: 0,
          source: "absolute",
          timestamp: 0,
        },
        targetState.sun,
        0,
      )
    : sensorGuidance;
  const markerPosition = guidance
    ? alignmentMarkerPosition(guidance, 360, 120)
    : { leftPercent: 50, topPercent: 50, inFinder: false };
  const overlayInView =
    !!guidance &&
    Math.abs(guidance.headingDeltaDeg) <= 35 &&
    Math.abs(guidance.altitudeDeltaDeg) <= 25;
  const showCalibration = !manual && sensorGuidance?.quality === "poor";
  const cameraVisible = hasCamera && cameraReady;

  const cleanupSensors = () => {
    if (sensorTimeoutRef.current !== null) {
      globalThis.clearTimeout(sensorTimeoutRef.current);
      sensorTimeoutRef.current = null;
    }
    orientationRef.current?.stop();
    orientationRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setHasCamera(false);
    setCameraReady(false);
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
      if (sensorTimeoutRef.current !== null)
        globalThis.clearTimeout(sensorTimeoutRef.current);
      if (visibilityTimeoutRef.current !== null)
        globalThis.clearTimeout(visibilityTimeoutRef.current);
      orientationRef.current?.stop();
      stopStream(streamRef.current);
      if (videoRef.current) videoRef.current.srcObject = null;
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
  }, [onClose]);

  const playCamera = async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = true;
    try {
      await video.play();
      setCameraReady(true);
      setCameraMessage("");
    } catch {
      setCameraReady(false);
      setCameraMessage(
        "Camera is connected but the preview is paused. Tap Resume camera.",
      );
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || !hasCamera) return;
    let disposed = false;
    const playing = () => {
      if (disposed) return;
      setCameraReady(true);
      setCameraMessage("");
    };
    const interrupted = () => {
      if (disposed) return;
      setCameraReady(false);
      setCameraMessage(
        "Camera preview was interrupted. Tap Resume camera to reconnect it.",
      );
    };
    video.addEventListener("loadedmetadata", playCamera);
    video.addEventListener("playing", playing);
    video.addEventListener("stalled", interrupted);
    video.srcObject = stream;
    void playCamera();
    return () => {
      disposed = true;
      video.removeEventListener("loadedmetadata", playCamera);
      video.removeEventListener("playing", playing);
      video.removeEventListener("stalled", interrupted);
    };
  }, [hasCamera]);

  useEffect(() => {
    const handleVisibility = () => {
      if (visibilityTimeoutRef.current !== null) {
        globalThis.clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      if (!document.hidden || stage !== "active") {
        if (!document.hidden && stage === "active" && streamRef.current)
          void playCamera();
        return;
      }
      // Native permission sheets can briefly hide a mobile page. Waiting avoids
      // stopping a newly granted camera before its first frame is painted.
      visibilityTimeoutRef.current = globalThis.setTimeout(() => {
        if (!document.hidden) return;
        cleanupSensors();
        setStage("paused");
        setSensorMessage(
          "Alignment paused while the page was in the background.",
        );
      }, 900);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (visibilityTimeoutRef.current !== null)
        globalThis.clearTimeout(visibilityTimeoutRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stage]);

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
    setNavigationMode("sensor");
    setStage("requesting");
    setSensorMessage("Waiting for a compass reading…");
    setCameraMessage("");

    const orientationResult = await startOrientationSensor(
      sessionLocation,
      (next) => {
        const smoothed = smoothReading(smoothedRef.current, next);
        smoothedRef.current = smoothed;
        headingsRef.current = [
          ...headingsRef.current.slice(-19),
          next.headingDeg,
        ];
        setReading(smoothed);
        setJitter(circularJitter(headingsRef.current));
        setSensorMessage("");
      },
    );
    if (orientationResult.source === "listening") {
      orientationRef.current = orientationResult;
      sensorTimeoutRef.current = globalThis.setTimeout(() => {
        if (smoothedRef.current) return;
        setSensorMessage(
          "No absolute compass reading arrived. Manual horizon is active.",
        );
        setNavigationMode("manual");
      }, 3000);
    } else {
      setSensorMessage(orientationResult.message);
      setNavigationMode("manual");
    }

    // Request camera access after the motion permission sheet has closed.
    // Stacking native prompts is unreliable in mobile Safari.
    const cameraResult = await Promise.resolve().then(() =>
      navigator.mediaDevices?.getUserMedia
        ? navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          })
        : Promise.reject(new Error("Camera unavailable")),
    );
    streamRef.current = cameraResult;
    cameraResult.getVideoTracks().forEach((track) => {
      track.addEventListener("mute", () => {
        setCameraReady(false);
        setCameraMessage(
          "Camera preview was interrupted. Tap Resume camera to reconnect it.",
        );
      });
      track.addEventListener("unmute", () => void playCamera());
      track.addEventListener(
        "ended",
        () => {
          setHasCamera(false);
          setCameraReady(false);
          setCameraMessage(
            "Camera preview stopped; the alignment guide remains active.",
          );
        },
        { once: true },
      );
    });
    setHasCamera(true);
    setStage("active");
  };

  const startAlignmentSafely = async () => {
    try {
      await startAlignment();
    } catch {
      setHasCamera(false);
      setCameraReady(false);
      setCameraMessage("Camera unavailable; using the simulated sky finder.");
      setStage("active");
    }
  };

  const enterManualHorizon = () => {
    setManualHeading(Math.round(reading?.headingDeg ?? manualHeading));
    setNavigationMode("manual");
  };

  const stepManualHeading = (delta: number) => {
    setManualHeading((heading) => normalizeDegrees(heading + delta));
  };

  const usePhoneCompass = () => {
    if (reading) setNavigationMode("sensor");
  };

  const close = () => {
    cleanupSensors();
    onClose();
  };

  const clearCapturedPhoto = () => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = null;
    setCapturedPhoto(null);
    setPhotoMessage("");
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !cameraVisible) return;
    setPhotoMessage("Taking photo…");
    try {
      const eventLabel =
        followLive && liveAvailable ? "Live eclipse" : selected.label;
      const blob = await captureAlignmentPhoto(video, targetState, {
        includeOverlay: includePhotoOverlay,
        showEclipse: overlayInView,
        eventLabel,
        eventTime: formatTime(targetTime, true),
        directionLabel: `${Math.round(targetState.sun.azimuthDeg)}° ${directionFor(targetState.sun.azimuthDeg)} · ${Math.round(targetState.sun.altitudeDeg)}° up`,
      });
      clearCapturedPhoto();
      const url = URL.createObjectURL(blob);
      capturedUrlRef.current = url;
      const suffix = includePhotoOverlay ? "ar" : "camera";
      setCapturedPhoto({
        blob,
        url,
        includeOverlay: includePhotoOverlay,
        filename: `eclipse-26-${targetTime.toISOString().replace(/[:.]/g, "-")}-${suffix}.jpg`,
      });
      setPhotoMessage("Photo ready.");
    } catch (error) {
      setPhotoMessage(
        error instanceof Error
          ? error.message
          : "The photo could not be created.",
      );
    }
  };

  const sharePhoto = async () => {
    if (!capturedPhoto || !navigator.share) return;
    const file = new File([capturedPhoto.blob], capturedPhoto.filename, {
      type: capturedPhoto.blob.type || "image/jpeg",
    });
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        setPhotoMessage(
          "Photo sharing is unavailable here. Save the image instead.",
        );
        return;
      }
      await navigator.share({
        title: "Eclipse/26 sky preview",
        text: capturedPhoto.includeOverlay
          ? "My Eclipse/26 AR sky preview"
          : "My Eclipse/26 viewing location",
        files: [file],
      });
      setPhotoMessage("Photo shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPhotoMessage("Photo sharing failed. Save the image instead.");
    }
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
                onClick={startAlignmentSafely}
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
            className={`alignment-active ${cameraVisible ? "has-camera" : "sensor-only"} ${manual ? "manual-mode" : "sensor-mode"}`}
          >
            <div className="alignment-viewport">
              {hasCamera && (
                <video
                  ref={videoRef}
                  className={cameraReady ? "camera-ready" : ""}
                  autoPlay
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
                data-quality={
                  manual ? "manual" : (guidance?.quality ?? "manual")
                }
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
                {guidance && (
                  <span
                    className="alignment-target-marker"
                    data-testid="alignment-target-marker"
                    style={{
                      left: `${markerPosition.leftPercent}%`,
                      top: `${markerPosition.topPercent}%`,
                    }}
                    aria-hidden="true"
                  >
                    <i />
                    <EclipseDiskOverlay
                      state={targetState}
                      visible={observable && overlayInView}
                    />
                  </span>
                )}
              </div>

              <div className="alignment-instruction">
                <span
                  className={`alignment-quality ${manual ? "manual" : (guidance?.quality ?? "manual")}`}
                >
                  {manual
                    ? "Manual 360° horizon"
                    : guidance?.quality === "good"
                      ? "Compass ready"
                      : guidance?.quality === "approximate"
                        ? "Approximate heading"
                        : guidance?.quality === "poor"
                          ? "Calibration needed"
                          : "Manual guide"}
                </span>
                <h3 aria-live="polite">
                  {!observable
                    ? "This moment is below your horizon"
                    : stage === "requesting"
                      ? "Starting phone sensors…"
                      : manual
                        ? Math.abs(guidance?.headingDeltaDeg ?? 180) <= 3
                          ? "Target centered — face this bearing"
                          : `Move the horizon ${guidance && guidance.headingDeltaDeg > 0 ? "right" : "left"}`
                        : (guidance?.instruction ??
                          "Use the bearing shown below")}
                </h3>
                <p>
                  Target {Math.round(targetState.sun.azimuthDeg)}°{" "}
                  {directionFor(targetState.sun.azimuthDeg)} ·{" "}
                  {Math.round(targetState.sun.altitudeDeg)}° up
                </p>
                {(manual || reading) && (
                  <p data-testid="current-alignment-heading">
                    Facing{" "}
                    {Math.round(manual ? manualHeading : reading!.headingDeg)}°{" "}
                    {directionFor(manual ? manualHeading : reading!.headingDeg)}
                  </p>
                )}
                <time dateTime={targetTime.toISOString()}>
                  {followLive && liveAvailable ? "Live now" : selected.label} ·{" "}
                  {formatTime(targetTime, true)}
                </time>
                {manual && (
                  <div
                    className="manual-horizon-control"
                    data-testid="manual-horizon-control"
                  >
                    <div>
                      <button
                        aria-label="Move manual horizon left 15 degrees"
                        onClick={() => stepManualHeading(-15)}
                      >
                        −15°
                      </button>
                      <output htmlFor="manual-horizon-heading">
                        {Math.round(manualHeading)}°{" "}
                        {directionFor(manualHeading)}
                      </output>
                      <button
                        aria-label="Move manual horizon right 15 degrees"
                        onClick={() => stepManualHeading(15)}
                      >
                        +15°
                      </button>
                    </div>
                    <input
                      id="manual-horizon-heading"
                      data-testid="manual-horizon-heading"
                      type="range"
                      min="0"
                      max="359"
                      step="1"
                      value={Math.round(manualHeading)}
                      aria-label="Manual horizon heading"
                      onChange={(event) =>
                        setManualHeading(Number(event.target.value))
                      }
                    />
                    <div className="manual-cardinals" aria-hidden="true">
                      <span>N · 0°</span>
                      <span>E · 90°</span>
                      <span>S · 180°</span>
                      <span>W · 270°</span>
                    </div>
                    <button
                      className="text-button manual-target-button"
                      onClick={() =>
                        setManualHeading(targetState.sun.azimuthDeg)
                      }
                    >
                      Jump to target bearing
                    </button>
                  </div>
                )}
                <small>
                  Sun and Moon disks enlarged equally; direction and overlap are
                  calculated.
                </small>
              </div>
              {cameraVisible && stage === "active" && !capturedPhoto && (
                <div className="alignment-capture-controls">
                  <label className="photo-overlay-toggle">
                    <input
                      type="checkbox"
                      data-testid="photo-overlay-toggle"
                      checked={includePhotoOverlay}
                      onChange={(event) =>
                        setIncludePhotoOverlay(event.target.checked)
                      }
                    />
                    <span aria-hidden="true" />
                    Include AR overlay
                  </label>
                  <button
                    className="camera-shutter"
                    data-testid="take-alignment-photo"
                    aria-label={`Take photo ${includePhotoOverlay ? "with AR overlay" : "without AR overlay"}`}
                    onClick={takePhoto}
                  >
                    <i aria-hidden="true" />
                  </button>
                </div>
              )}
              {photoMessage && !capturedPhoto && (
                <p className="photo-capture-message" role="status">
                  {photoMessage}
                </p>
              )}
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
              {hasCamera && !cameraReady && stage === "active" && (
                <button className="secondary-button" onClick={playCamera}>
                  Resume camera
                </button>
              )}
              {stage === "paused" && (
                <button
                  className="primary-button"
                  onClick={startAlignmentSafely}
                >
                  Resume alignment
                </button>
              )}
              {stage === "active" && !manual && (
                <button
                  className="text-button"
                  data-testid="open-manual-horizon"
                  onClick={enterManualHorizon}
                >
                  Manual 360° horizon
                </button>
              )}
              {stage === "active" && manual && reading && (
                <button
                  className="text-button"
                  data-testid="return-to-compass"
                  onClick={usePhoneCompass}
                >
                  Use phone compass
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
            {capturedPhoto && (
              <section
                className="photo-review"
                aria-labelledby="photo-review-title"
                data-testid="alignment-photo-review"
              >
                <header>
                  <div>
                    <span className="kicker">
                      {capturedPhoto.includeOverlay
                        ? "AR OVERLAY INCLUDED"
                        : "CAMERA ONLY"}
                    </span>
                    <h3 id="photo-review-title">Your eclipse photo</h3>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Close photo preview"
                    onClick={clearCapturedPhoto}
                  >
                    ×
                  </button>
                </header>
                <img
                  src={capturedPhoto.url}
                  alt="Captured eclipse camera preview"
                />
                <footer>
                  <button className="text-button" onClick={clearCapturedPhoto}>
                    Retake
                  </button>
                  {typeof navigator.share === "function" && (
                    <button className="secondary-button" onClick={sharePhoto}>
                      Share photo
                    </button>
                  )}
                  <a
                    className="primary-button photo-save-button"
                    data-testid="save-alignment-photo"
                    href={capturedPhoto.url}
                    download={capturedPhoto.filename}
                  >
                    Save photo
                  </a>
                  <p role="status">{photoMessage}</p>
                </footer>
              </section>
            )}
          </main>
        )}
      </div>
    </dialog>
  );
}
