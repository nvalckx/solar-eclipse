import { useEffect, useMemo, useRef, useState } from "react";
import { captureAlignmentPhoto } from "../alignment-photo";
import { calculateSkyState, eclipseWindowFor } from "../eclipse-logic";
import { eclipseEvents, type EclipseEventKey } from "../live-view";
import {
  alignmentGuidance,
  circularJitter,
  normalizeDegrees,
  smoothReading,
  type OrientationReading,
} from "../phone-alignment";
import {
  startOrientationSensor,
  type OrientationController,
} from "../orientation-sensor";
import {
  describeDirection,
  zoomSkyView,
  type GuideMode,
  type SensorCapability,
  type SkyViewState,
} from "../sky-guide";
import { createSkyGuideScene } from "../sky-guide-scene";
import type { ObserverLocation } from "../types";
import { SkySphereCanvas } from "./SkySphereCanvas";

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
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(normalizeDegrees(azimuth) / 45) % 8
  ];

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
  const modeRef = useRef<GuideMode>("explore");
  const headingCorrectionRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const [sessionLocation, setSessionLocation] = useState(location);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationMessage, setLocationMessage] = useState(
    "Using the selected viewing location.",
  );
  const [locating, setLocating] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EclipseEventKey>("MAX");
  const [followLive, setFollowLive] = useState(true);
  const [mode, setMode] = useState<GuideMode>("explore");
  const [reading, setReading] = useState<OrientationReading | null>(null);
  const [sensorCapability, setSensorCapability] =
    useState<SensorCapability>("none");
  const [jitter, setJitter] = useState(0);
  const [sensorMessage, setSensorMessage] = useState(
    "Drag anywhere to explore the complete sky.",
  );
  const [headingCorrection, setHeadingCorrection] = useState(0);
  const [showHeadingCorrection, setShowHeadingCorrection] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
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
  const targetLabel = followLive && liveAvailable ? "Live now" : selected.label;
  const scene = useMemo(
    () =>
      createSkyGuideScene(
        targetTime,
        targetLabel,
        sessionLocation,
        window,
        events,
      ),
    [events, sessionLocation, targetLabel, targetTime, window],
  );
  const [view, setView] = useState<SkyViewState>(() => {
    const initialWindow = eclipseWindowFor(location);
    const initial = calculateSkyState(
      initialWindow.peak,
      location,
      initialWindow,
    );
    return {
      azimuthDeg: initial.sun.azimuthDeg,
      altitudeDeg: initial.sun.altitudeDeg,
      rollDeg: 0,
      fovDeg: 68,
    };
  });
  const quality = reading
    ? alignmentGuidance(reading, scene.target, jitter).quality
    : null;
  const arActive = mode === "ar" && cameraReady;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    headingCorrectionRef.current = headingCorrection;
  }, [headingCorrection]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const stopCamera = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  const stopSensors = () => {
    if (sensorTimeoutRef.current !== null) {
      globalThis.clearTimeout(sensorTimeoutRef.current);
      sensorTimeoutRef.current = null;
    }
    orientationRef.current?.stop();
    orientationRef.current = null;
  };

  const cleanup = () => {
    stopSensors();
    stopCamera();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      stopSensors();
      stopStream(streamRef.current);
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) return;
      cleanup();
      modeRef.current = "explore";
      setMode("explore");
      setSensorMessage(
        "Tracking paused while the guide was in the background. Drag to explore or resume the compass.",
      );
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  });

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || mode !== "ar") return;
    video.srcObject = stream;
    video.muted = true;
    let disposed = false;
    const play = async () => {
      try {
        await video.play();
        if (!disposed) {
          setCameraReady(true);
          setCameraMessage("");
        }
      } catch {
        if (!disposed) {
          setCameraReady(false);
          setCameraMessage(
            "Camera preview paused. Tap Camera AR to resume it.",
          );
        }
      }
    };
    void play();
    return () => {
      disposed = true;
    };
  }, [mode]);

  const close = () => {
    cleanup();
    onClose();
  };

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "Device location is unavailable; keeping the selected place.",
      );
      return;
    }
    setLocating(true);
    setLocationMessage("Finding this device’s location…");
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
          `Location refreshed · accurate to about ${Math.round(position.coords.accuracy)} m.`,
        );
        setLocating(false);
        onLocationChange(next);
        const nextWindow = eclipseWindowFor(next);
        const nextTarget = calculateSkyState(
          nextWindow.peak,
          next,
          nextWindow,
        ).sun;
        setView((current) => ({
          ...current,
          azimuthDeg: nextTarget.azimuthDeg,
          altitudeDeg: nextTarget.altitudeDeg,
          rollDeg: 0,
        }));
      },
      (error) => {
        setLocationMessage(
          error.code === error.TIMEOUT
            ? "Location timed out; keeping the selected place."
            : "Location access was denied; keeping the selected place.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  };

  const startTracking = async () => {
    stopSensors();
    smoothedRef.current = null;
    headingsRef.current = [];
    setReading(null);
    setJitter(0);
    setSensorMessage("Waiting for a device orientation reading…");
    modeRef.current = "sensor";
    setMode("sensor");
    const result = await startOrientationSensor(
      sessionLocation,
      (nextReading) => {
        const corrected = {
          ...nextReading,
          headingDeg: normalizeDegrees(
            nextReading.headingDeg + headingCorrectionRef.current,
          ),
        };
        const smoothed = smoothReading(smoothedRef.current, corrected);
        smoothedRef.current = smoothed;
        headingsRef.current = [
          ...headingsRef.current.slice(-19),
          corrected.headingDeg,
        ];
        setReading(smoothed);
        setSensorCapability(corrected.capability ?? "none");
        setJitter(circularJitter(headingsRef.current));
        setSensorMessage("");
        if (modeRef.current === "sensor" || modeRef.current === "ar") {
          setView((current) => ({
            ...current,
            azimuthDeg: smoothed.headingDeg,
            altitudeDeg: smoothed.altitudeDeg,
            rollDeg: smoothed.rollDeg,
          }));
        }
      },
      view.azimuthDeg,
    );
    if (result.source !== "listening") {
      modeRef.current = "explore";
      setMode("explore");
      setSensorCapability("none");
      setSensorMessage(`${result.message} Drag the all-sphere map instead.`);
      return;
    }
    orientationRef.current = result;
    sensorTimeoutRef.current = globalThis.setTimeout(() => {
      if (smoothedRef.current) return;
      modeRef.current = "explore";
      setMode("explore");
      setSensorMessage(
        "No orientation reading arrived. The full manual sky remains available.",
      );
    }, 3500);
  };

  const resumeTracking = () => {
    if (!orientationRef.current) {
      void startTracking();
      return;
    }
    modeRef.current = "sensor";
    setMode("sensor");
    stopCamera();
    if (reading) {
      setView((current) => ({
        ...current,
        azimuthDeg: reading.headingDeg,
        altitudeDeg: reading.altitudeDeg,
        rollDeg: reading.rollDeg,
      }));
    }
  };

  const enterExplore = () => {
    if (modeRef.current === "explore") return;
    if (modeRef.current === "ar") stopCamera();
    modeRef.current = "explore";
    setMode("explore");
    setSensorMessage(
      "Explore mode · use the orientation control to resume sensor tracking.",
    );
  };

  const startCamera = async () => {
    if (
      !reading ||
      sensorCapability === "tilt" ||
      sensorCapability === "none"
    ) {
      setCameraMessage("Start compass tracking before enabling camera AR.");
      return;
    }
    stopCamera();
    setCameraMessage("Starting the rear camera…");
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!stream) throw new Error("Camera unavailable");
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("mute", () => setCameraReady(false));
        track.addEventListener(
          "ended",
          () => {
            setCameraReady(false);
            setCameraMessage(
              "Camera preview stopped; returning to the sky map.",
            );
            modeRef.current = "sensor";
            setMode("sensor");
          },
          { once: true },
        );
      });
      modeRef.current = "ar";
      setMode("ar");
    } catch {
      modeRef.current = "sensor";
      setMode("sensor");
      setCameraMessage(
        "Camera access is unavailable; device tracking is still active.",
      );
    }
  };

  const centerTarget = () => {
    enterExplore();
    setView((current) => ({
      ...current,
      azimuthDeg: scene.target.azimuthDeg,
      altitudeDeg: scene.target.altitudeDeg,
      rollDeg: 0,
    }));
  };

  const resetHorizon = () => {
    enterExplore();
    setView((current) => ({
      ...current,
      altitudeDeg: 0,
      rollDeg: 0,
      fovDeg: 68,
    }));
  };

  const clearCapturedPhoto = () => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = null;
    setCapturedPhoto(null);
    setPhotoMessage("");
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    setPhotoMessage("Taking photo…");
    try {
      const blob = await captureAlignmentPhoto(
        video,
        scene.state,
        {
          includeOverlay: includePhotoOverlay,
          showEclipse: true,
          eventLabel: targetLabel,
          eventTime: formatTime(targetTime, true),
          directionLabel: describeDirection(scene.target),
        },
        { scene, view },
      );
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
        error instanceof Error ? error.message : "Photo capture failed.",
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
        setPhotoMessage("Photo sharing is unavailable here. Save it instead.");
        return;
      }
      await navigator.share({
        title: "Eclipse/26 sky preview",
        text: "My Eclipse/26 all-sky preview",
        files: [file],
      });
      setPhotoMessage("Photo shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPhotoMessage("Photo sharing failed. Save it instead.");
    }
  };

  const chooseEvent = (key: EclipseEventKey, time: Date) => {
    setSelectedEvent(key);
    setFollowLive(false);
    const target = calculateSkyState(time, sessionLocation, window).sun;
    enterExplore();
    setView((current) => ({
      ...current,
      azimuthDeg: target.azimuthDeg,
      altitudeDeg: target.altitudeDeg,
      rollDeg: 0,
    }));
  };

  const modeLabel =
    mode === "ar"
      ? "Camera AR"
      : mode === "sensor"
        ? sensorCapability === "absolute"
          ? "Compass tracking"
          : sensorCapability === "relative"
            ? "Relative tracking"
            : sensorCapability === "tilt"
              ? "Tilt assist"
              : "Starting sensors"
        : "Explore mode";

  return (
    <dialog
      ref={dialogRef}
      className="alignment-dialog sky-guide-dialog"
      aria-labelledby="alignment-title"
      data-testid="phone-alignment-dialog"
    >
      <div className="alignment-shell">
        <header className="alignment-header">
          <div>
            <span className="kicker">PRIVATE · ON THIS DEVICE</span>
            <h2 id="alignment-title">All-sphere sky guide</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close sky guide"
            data-testid="close-phone-alignment"
            onClick={close}
          >
            ×
          </button>
        </header>

        <main className={`sky-guide-active mode-${mode}`}>
          <div className="sky-guide-viewport">
            {mode === "ar" && (
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
            <SkySphereCanvas
              scene={scene}
              view={view}
              transparent={arActive}
              onViewChange={setView}
              onExplore={enterExplore}
            />

            <div className="sky-guide-safety">
              <strong>Never use this guide as eye protection.</strong>
              <span>
                Camera optics require a front-mounted solar filter during
                partial phases.
              </span>
            </div>

            <nav className="alignment-events" aria-label="Sky target time">
              {liveAvailable && (
                <button
                  data-testid="alignment-event-live"
                  aria-pressed={followLive}
                  onClick={() => {
                    setFollowLive(true);
                    const liveTarget = calculateSkyState(
                      now,
                      sessionLocation,
                      window,
                    ).sun;
                    enterExplore();
                    setView((current) => ({
                      ...current,
                      azimuthDeg: liveTarget.azimuthDeg,
                      altitudeDeg: liveTarget.altitudeDeg,
                      rollDeg: 0,
                    }));
                  }}
                >
                  <small>LIVE</small> Now
                </button>
              )}
              {events.map((event) => {
                const eventState = calculateSkyState(
                  event.time,
                  sessionLocation,
                  window,
                );
                const observable = eventState.sun.altitudeDeg > -0.833;
                return (
                  <button
                    key={event.key}
                    data-testid={`alignment-event-${event.key.toLowerCase()}`}
                    aria-pressed={
                      (!followLive || !liveAvailable) &&
                      selected.key === event.key
                    }
                    data-below-horizon={observable ? "false" : "true"}
                    title={
                      observable
                        ? event.label
                        : `${event.label} is below the local horizon`
                    }
                    onClick={() => chooseEvent(event.key, event.time)}
                  >
                    <small>{event.key}</small> {formatTime(event.time)}
                  </button>
                );
              })}
            </nav>

            <section className="sky-guide-readout" aria-live="polite">
              <span className={`alignment-quality ${quality ?? "manual"}`}>
                {modeLabel}
              </span>
              <strong>{targetLabel}</strong>
              <span>
                Target {Math.round(scene.target.azimuthDeg)}°{" "}
                {directionFor(scene.target.azimuthDeg)} ·{" "}
                {Math.round(scene.target.altitudeDeg)}° altitude
              </span>
              <span data-testid="current-alignment-heading">
                View {Math.round(view.azimuthDeg)}°{" "}
                {directionFor(view.azimuthDeg)} · {Math.round(view.altitudeDeg)}
                ° altitude
              </span>
              {!scene.targetObservable && (
                <em>Below the local horizon · not observable</em>
              )}
            </section>

            <div
              className="sky-guide-view-controls"
              aria-label="Sky view controls"
            >
              <button data-testid="center-sky-target" onClick={centerTarget}>
                ◎ Target
              </button>
              <button onClick={resetHorizon}>Horizon</button>
              <button
                aria-label="Zoom in sky map"
                onClick={() => setView((current) => zoomSkyView(current, 0.82))}
              >
                ＋
              </button>
              <button
                aria-label="Zoom out sky map"
                onClick={() => setView((current) => zoomSkyView(current, 1.22))}
              >
                −
              </button>
            </div>

            <div className="sky-guide-mode-controls">
              <button
                className={mode === "sensor" ? "active" : ""}
                data-testid="sky-guide-compass"
                aria-pressed={mode === "sensor"}
                onClick={resumeTracking}
              >
                ◉{" "}
                {orientationRef.current
                  ? "Resume tracking"
                  : "Use device orientation"}
              </button>
              <button
                className={mode === "ar" ? "active" : ""}
                data-testid="sky-guide-camera"
                aria-pressed={mode === "ar"}
                disabled={
                  !reading ||
                  sensorCapability === "tilt" ||
                  sensorCapability === "none"
                }
                onClick={() => void startCamera()}
              >
                ◫ Camera AR
              </button>
            </div>

            {mode === "ar" && cameraReady && !capturedPhoto && (
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
                  Include sky overlay
                </label>
                <button
                  className="camera-shutter"
                  data-testid="take-alignment-photo"
                  aria-label={`Take photo ${includePhotoOverlay ? "with AR overlay" : "without AR overlay"}`}
                  onClick={() => void takePhoto()}
                >
                  <i aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <aside className="sky-guide-panel">
            <div className="sky-guide-location">
              <span className="kicker">VIEWING FROM</span>
              <strong>{sessionLocation.label}</strong>
              <small>
                {sessionLocation.latitude.toFixed(4)}°,{" "}
                {sessionLocation.longitude.toFixed(4)}°
                {locationAccuracy !== null
                  ? ` · ±${Math.round(locationAccuracy)} m`
                  : ""}
              </small>
              <button
                disabled={locating}
                onClick={refreshLocation}
                data-testid="refresh-alignment-location"
              >
                {locating ? "Locating…" : "Refresh device location"}
              </button>
              <p role="status">{locationMessage}</p>
            </div>
            <div className="sky-guide-help">
              <strong>Drag anywhere. Look everywhere.</strong>
              <p>
                Swipe or drag across the full sphere. Pinch or scroll to zoom.
                Moving the map pauses sensor tracking.
              </p>
              <p role="status">{sensorMessage}</p>
              {cameraMessage && <p role="status">{cameraMessage}</p>}
              {(quality === "poor" || sensorCapability === "relative") && (
                <button
                  className="text-button"
                  onClick={() => setShowHeadingCorrection((value) => !value)}
                >
                  Adjust compass alignment
                </button>
              )}
              {showHeadingCorrection && (
                <label className="heading-correction">
                  Heading correction{" "}
                  <output>
                    {headingCorrection > 0 ? "+" : ""}
                    {headingCorrection}°
                  </output>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    value={headingCorrection}
                    onChange={(event) =>
                      setHeadingCorrection(Number(event.target.value))
                    }
                  />
                </label>
              )}
            </div>
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
                      ? "SKY OVERLAY INCLUDED"
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
                  <button
                    className="secondary-button"
                    onClick={() => void sharePhoto()}
                  >
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
      </div>
    </dialog>
  );
}
