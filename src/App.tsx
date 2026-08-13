import { useEffect, useMemo, useRef, useState } from "react";
import * as Astronomy from "astronomy-engine";
import { DEFAULT_CITY } from "./city-catalog";
import {
  calculateSkyState,
  DEFAULT_ECLIPSE_ID,
  localEclipseFor,
  nextLocalTotalEclipse,
  nextVisibleEclipse,
} from "./eclipse-logic";
import { ECLIPSE_CATALOG, eclipseById } from "./eclipse-catalog";
import { loadEclipsePath } from "./eclipse-paths";
import type {
  AppView,
  EclipseId,
  EclipseRecord,
  EclipsePathData,
  EclipseWindow,
  ObserverLocation,
  SkyMode,
  SkyState,
} from "./types";
import {
  buildShareUrl,
  LOCATION_STORAGE_KEY,
  parseSharedView,
  parseStoredEclipseId,
  parseStoredLocation,
  SELECTED_ECLIPSE_STORAGE_KEY,
  serializeStoredEclipseId,
  serializeStoredLocation,
} from "./view-state";
import { LocationDialog } from "./components/LocationDialog";
import { PathDialog } from "./components/PathDialog";
import { ShareDialog } from "./components/ShareDialog";
import { SkyCanvas } from "./components/SkyCanvas";
import { Timeline } from "./components/Timeline";
import { DirectionCompass } from "./components/DirectionCompass";
import { LiveView } from "./components/LiveView";
import { PhoneAlignmentDialog } from "./components/PhoneAlignmentDialog";
import { NotificationDialog } from "./components/NotificationDialog";
import { EclipseCatalog } from "./components/EclipseCatalog";
import { DetailedMap } from "./components/DetailedMap";
import { EclipseMap } from "./components/EclipseMap";
import { timezoneAt } from "./place-catalog";
import { nearestPointOnPath, PATH_END_MS, PATH_START_MS } from "./map-data";
import {
  ALERTS_STORAGE_KEY,
  alertBody,
  buildAlertSchedule,
  DEFAULT_ALERT_PREFERENCES,
  isEventArmed,
  parseStoredAlertPreferences,
  serializeAlertPreferences,
  type AlertPreferences,
} from "./notifications";
import {
  createShareCard,
  shareCardFilename,
  type ShareCardSnapshot,
  type ShareCardModel,
} from "./share-card";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const GOLF_LOCATION_LABEL = "Pitch&Putt Molenhoek";

type ShareAsset = {
  file: File;
  previewUrl: string;
  downloadUrl: string;
};

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("The share image could not be read.")),
    );
    reader.readAsDataURL(blob);
  });
}

function readSavedLocation() {
  try {
    return parseStoredLocation(localStorage.getItem(LOCATION_STORAGE_KEY));
  } catch {
    return null;
  }
}

function readSavedAlerts() {
  try {
    return parseStoredAlertPreferences(
      localStorage.getItem(ALERTS_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

function readSavedEclipseId() {
  try {
    return parseStoredEclipseId(
      localStorage.getItem(SELECTED_ECLIPSE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function unavailableWindow(record: EclipseRecord): EclipseWindow {
  const peak = new Date(record.peakUtc);
  return {
    eventId: record.id,
    globalType: record.type,
    localType: "partial",
    phaseLabel: "Not visible from this location",
    start: new Date(peak.getTime() - 2 * 60 * 60_000),
    peak,
    end: new Date(peak.getTime() + 2 * 60 * 60_000),
    kind: Astronomy.EclipseKind.Partial,
    peakObscuration: 0,
    visible: false,
    sourceUrl: record.pathUrl ?? record.mapUrl,
  };
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
  if (state.eclipse.type === "total") return "Totality: the corona is visible";
  if (state.eclipse.type === "annular")
    return "Annularity: the ring of fire is visible";
  return `${Math.round(state.eclipse.obscurationPercent)}% of the Sun is covered`;
}

function formatDuration(seconds: number | undefined) {
  if (!seconds) return "Not total here";
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}

function timeAtCoverage(
  startMs: number,
  endMs: number,
  targetPercent: number,
  location: ObserverLocation,
  eclipseWindow: EclipseWindow,
  ascending: boolean,
) {
  let low = startMs;
  let high = endMs;
  for (let index = 0; index < 28; index += 1) {
    const middle = (low + high) / 2;
    const coverage = calculateSkyState(
      new Date(middle),
      location,
      eclipseWindow,
    ).eclipse.obscurationPercent;
    if (ascending ? coverage < targetPercent : coverage > targetPercent)
      low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function App() {
  const initial = useMemo(() => {
    const fallback = readSavedLocation() ?? DEFAULT_CITY;
    const storedId = readSavedEclipseId();
    const next = nextVisibleEclipse(fallback, new Date());
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const fallbackId =
      requestedView === null
        ? (next?.eventId ?? storedId ?? DEFAULT_ECLIPSE_ID)
        : (storedId ?? next?.eventId ?? DEFAULT_ECLIPSE_ID);
    const shared = parseSharedView(
      window.location.search,
      fallback,
      fallbackId,
    );
    const migratedLegacyId =
      shared.version === 1 &&
      (params.has("lat") || params.has("time") || params.has("mode"))
        ? DEFAULT_ECLIPSE_ID
        : undefined;
    const requestedEclipseId =
      shared.eclipseId ?? migratedLegacyId ?? fallbackId;
    const eclipseId = eclipseById(requestedEclipseId)
      ? requestedEclipseId
      : fallbackId;
    const result = localEclipseFor(eclipseId, shared.location);
    const eclipse = result.visible
      ? result.window
      : unavailableWindow(result.record);
    const min = eclipse.start.getTime() - 30 * 60_000;
    const max = eclipse.end.getTime() + 30 * 60_000;
    return {
      location: shared.location,
      mode: shared.mode,
      eclipseId,
      view:
        requestedView === "catalog"
          ? ("catalog" as const)
          : shared.eclipseId
            ? ("event" as const)
            : ("next" as const),
      nowMs: clamp(
        shared.timestamp?.getTime() ?? eclipse.peak.getTime(),
        min,
        max,
      ),
    };
  }, []);

  const [location, setLocation] = useState(initial.location);
  const [selectedEclipseId, setSelectedEclipseId] = useState<EclipseId>(
    initial.eclipseId,
  );
  const [appView, setAppView] = useState<AppView>(initial.view);
  const [mode, setMode] = useState<SkyMode>(initial.mode);
  const [nowMs, setNowMs] = useState(initial.nowMs);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [showLocation, setShowLocation] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const [mapView, setMapView] = useState<"overview" | "detail">("overview");
  const [showAlignment, setShowAlignment] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [alertPreferences, setAlertPreferences] = useState(readSavedAlerts);
  const [shareUrl, setShareUrl] = useState("");
  const [shareAsset, setShareAsset] = useState<ShareAsset | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [eventPath, setEventPath] = useState<EclipsePathData | null>(null);
  const pathReturnRef = useRef<{ nowMs: number; isPlaying: boolean } | null>(
    null,
  );
  const locationButtonRef = useRef<HTMLButtonElement>(null);
  const locationReturnRef = useRef<HTMLButtonElement | null>(null);
  const pathButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const alignmentReturnRef = useRef<HTMLElement | null>(null);
  const notificationReturnRef = useRef<HTMLButtonElement | null>(null);
  const shareGenerationRef = useRef(0);
  const sharePreviewUrlRef = useRef("");

  const eclipseResult = useMemo(
    () => localEclipseFor(selectedEclipseId, location),
    [location, selectedEclipseId],
  );
  const selectedRecord = eclipseResult.record;
  const eclipseWindow = useMemo(
    () =>
      eclipseResult.visible
        ? eclipseResult.window
        : unavailableWindow(eclipseResult.record),
    [eclipseResult],
  );
  useEffect(() => {
    let active = true;
    setEventPath(null);
    void loadEclipsePath(selectedEclipseId).then((path) => {
      if (active) setEventPath(path ?? null);
    });
    return () => {
      active = false;
    };
  }, [selectedEclipseId]);
  const nextAtLocation = useMemo(
    () => nextVisibleEclipse(location, new Date()),
    [location],
  );
  const nextTotalAtLocation = useMemo(
    () => nextLocalTotalEclipse(location, new Date()),
    [location],
  );
  const nearestCentralPath = useMemo(
    () =>
      eventPath?.centerline.length
        ? nearestPointOnPath(
            [location.longitude, location.latitude],
            eventPath.centerline,
          )
        : undefined,
    [eventPath, location.latitude, location.longitude],
  );
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
  const shareSnapshots = useMemo<ShareCardSnapshot[]>(() => {
    const start = eclipseWindow.start.getTime();
    const peak = eclipseWindow.peak.getTime();
    const end = eclipseWindow.end.getTime();
    // Keep the build/fade frames comfortably away from maximum so the five
    // thumbnails read as a progression at a glance.  A near-peak target made
    // the second and fourth frames visually collapse into their neighbours.
    const partialCoverage = eclipseWindow.peakObscuration * 100 * 0.45;
    const points =
      eclipseWindow.centralStart && eclipseWindow.centralEnd
        ? [
            { label: "C1", time: start },
            { label: "C2", time: eclipseWindow.centralStart.getTime() },
            { label: "MAX", time: peak, isPeak: true },
            { label: "C3", time: eclipseWindow.centralEnd.getTime() },
            { label: "C4", time: end },
          ]
        : [
            { label: "C1", time: start },
            {
              label: "BUILD",
              time: timeAtCoverage(
                start,
                peak,
                partialCoverage,
                location,
                eclipseWindow,
                true,
              ),
            },
            { label: "MAX", time: peak, isPeak: true },
            {
              label: "FADE",
              time: timeAtCoverage(
                peak,
                end,
                partialCoverage,
                location,
                eclipseWindow,
                false,
              ),
            },
            { label: "C4", time: end },
          ];
    return points.map((point) => {
      const date = new Date(point.time);
      return {
        label: point.label,
        time: localDateTime(date, location.timezone),
        state: calculateSkyState(date, location, eclipseWindow),
        isPeak: point.isPeak,
      };
    });
  }, [eclipseWindow, location]);
  const centralDurationSeconds =
    eclipseWindow.centralStart && eclipseWindow.centralEnd
      ? (eclipseWindow.centralEnd.getTime() -
          eclipseWindow.centralStart.getTime()) /
        1000
      : undefined;
  const description = `${mode === "sky" ? "Sky view" : "Magnified close-up"}. ${eventLabel(state)}. Sun altitude ${Math.round(state.sun.altitudeDeg)} degrees, azimuth ${Math.round(state.sun.azimuthDeg)} degrees.`;

  useEffect(() => {
    const updateClock = () => setLiveNowMs(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const playbackEnd = showPath ? PATH_END_MS : timeRange.end;
    let frame = 0;
    let previous = performance.now();
    const tick = (time: number) => {
      const elapsed = time - previous;
      previous = time;
      setNowMs((value) => {
        const next = value + elapsed * speed;
        if (next >= playbackEnd) {
          setIsPlaying(false);
          return playbackEnd;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, showPath, speed, timeRange.end]);

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

  useEffect(() => {
    try {
      localStorage.setItem(
        SELECTED_ECLIPSE_STORAGE_KEY,
        serializeStoredEclipseId(selectedEclipseId),
      );
    } catch {
      // Selection persistence is optional.
    }
  }, [selectedEclipseId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ALERTS_STORAGE_KEY,
        serializeAlertPreferences(alertPreferences),
      );
    } catch {
      // Alerts still work for this visit if storage is unavailable.
    }
  }, [alertPreferences]);

  useEffect(
    () => () => {
      if (sharePreviewUrlRef.current)
        URL.revokeObjectURL(sharePreviewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (
      !alertPreferences.enabled ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;

    const timers: number[] = [];
    const maximumDelay = 2_147_000_000;
    const schedule = (alert: ReturnType<typeof buildAlertSchedule>[number]) => {
      const arm = () => {
        const delay = alert.notifyAt.getTime() - Date.now();
        if (delay <= 0) {
          try {
            new Notification(
              `Solar eclipse ${selectedEclipseId} · ${alert.label}`,
              {
                body: alertBody(alert, location, alertPreferences.leadMinutes),
                icon: "./apple-touch-icon.png",
                tag: `solar-eclipse-${selectedEclipseId}-${alert.key}`,
              },
            );
          } catch {
            // Some mobile browsers expose permission without a constructible API.
          }
          return;
        }
        timers.push(window.setTimeout(arm, Math.min(delay, maximumDelay)));
      };
      arm();
    };

    buildAlertSchedule(eclipseWindow, alertPreferences).forEach(schedule);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alertPreferences, eclipseWindow, location, selectedEclipseId]);

  const openPath = () => {
    if (selectedEclipseId !== DEFAULT_ECLIPSE_ID) {
      document
        .querySelector("#event-map")
        ?.scrollIntoView({ behavior: "smooth" });
      setAnnouncement("Event map selected.");
      return;
    }
    pathReturnRef.current = { nowMs, isPlaying };
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setNowMs(PATH_START_MS);
    setIsPlaying(!reducedMotion);
    setShowPath(true);
    setAnnouncement(
      reducedMotion
        ? "Path replay opened at the first frame."
        : "Path replay started.",
    );
  };

  const closePath = () => {
    const previous = pathReturnRef.current;
    setShowPath(false);
    setIsPlaying(previous?.isPlaying ?? false);
    setNowMs(previous?.nowMs ?? nowMs);
    pathReturnRef.current = null;
    setAnnouncement("Path replay closed.");
    requestAnimationFrame(() => pathButtonRef.current?.focus());
  };

  const applyLocation = (next: ObserverLocation) => {
    const nextResult = localEclipseFor(selectedEclipseId, next);
    setLocation(next);
    setNowMs(
      nextResult.visible
        ? nextResult.window.peak.getTime()
        : new Date(nextResult.record.peakUtc).getTime(),
    );
    setIsPlaying(false);
    setShowLocation(false);
    setAnnouncement(
      `Location changed to ${next.label}. Maximum eclipse selected.`,
    );
    requestAnimationFrame(() =>
      (locationReturnRef.current ?? locationButtonRef.current)?.focus(),
    );
  };

  const applyMapCoordinates = (latitude: number, longitude: number) => {
    const coordinateLocation: ObserverLocation = {
      ...location,
      latitude,
      longitude,
      elevationMeters: 0,
      label: `${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`,
      source: "coordinates",
    };
    void timezoneAt(latitude, longitude)
      .then((timezone) => applyLocation({ ...coordinateLocation, timezone }))
      .catch(() => applyLocation(coordinateLocation));
  };

  const copyCoordinates = (
    latitude: number,
    longitude: number,
    label: string,
  ) => {
    void navigator.clipboard
      .writeText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`)
      .then(() => setAnnouncement(`${label} coordinates copied.`))
      .catch(() =>
        setAnnouncement(
          `${label} coordinates are ${latitude.toFixed(5)}, ${longitude.toFixed(5)}.`,
        ),
      );
  };

  const updateAlignmentLocation = (next: ObserverLocation) => {
    const nextResult = localEclipseFor(selectedEclipseId, next);
    setLocation(next);
    setNowMs(
      nextResult.visible
        ? nextResult.window.peak.getTime()
        : new Date(nextResult.record.peakUtc).getTime(),
    );
    setIsPlaying(false);
    setAnnouncement(
      `Phone location refreshed. Maximum eclipse recalculated for ${next.label}.`,
    );
  };

  const openLocation = (opener: HTMLButtonElement) => {
    locationReturnRef.current = opener;
    setShowLocation(true);
  };

  const closeLocation = () => {
    setShowLocation(false);
    requestAnimationFrame(() =>
      (locationReturnRef.current ?? locationButtonRef.current)?.focus(),
    );
  };

  const selectEclipse = (id: EclipseId, view: AppView = "event") => {
    const result = localEclipseFor(id, location);
    setSelectedEclipseId(id);
    setAppView(view);
    setNowMs(
      result.visible
        ? result.window.peak.getTime()
        : new Date(result.record.peakUtc).getTime(),
    );
    setIsPlaying(false);
    const url = new URL(window.location.href);
    url.searchParams.set("v", "2");
    url.searchParams.set("eclipse", id);
    if (view === "next") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    window.history.replaceState(null, "", url);
    setAnnouncement(`${id} eclipse selected.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showNext = () => {
    if (nextAtLocation) selectEclipse(nextAtLocation.eventId, "next");
    else setAppView("next");
  };

  const selectTime = (time: number) => {
    const next = clamp(time, timeRange.start, timeRange.end);
    setNowMs(next);
    setIsPlaying(false);
    setAnnouncement(
      `Selected ${localDateTime(new Date(next), location.timezone, true)}.`,
    );
  };

  const previewFromLive = (date: Date) => {
    selectTime(date.getTime());
    document.querySelector("#simulator")?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
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

  const closeShare = () => {
    shareGenerationRef.current += 1;
    if (sharePreviewUrlRef.current) {
      URL.revokeObjectURL(sharePreviewUrlRef.current);
      sharePreviewUrlRef.current = "";
    }
    setShareUrl("");
    setShareAsset(null);
    setShareLoading(false);
    setShareError("");
    setShareStatus("");
    requestAnimationFrame(() => shareButtonRef.current?.focus());
  };

  const handleShare = () => {
    const url = buildShareUrl(
      window.location.href,
      location,
      selectedDate,
      mode,
      selectedEclipseId,
    );
    const model: ShareCardModel = {
      state,
      eclipseWindow,
      mode,
      snapshots: shareSnapshots,
      locationLabel: location.label,
      selectedDate,
      selectedTime,
      zoneName,
      eventLabel: eventLabel(state),
      peakTime,
      totalityDurationLabel: formatDuration(
        eclipseWindow.totalityDurationSeconds,
      ),
    };
    const generation = shareGenerationRef.current + 1;
    shareGenerationRef.current = generation;
    if (sharePreviewUrlRef.current) {
      URL.revokeObjectURL(sharePreviewUrlRef.current);
      sharePreviewUrlRef.current = "";
    }
    setShareUrl(url);
    setShareAsset(null);
    setShareLoading(true);
    setShareError("");
    setShareStatus("");

    void createShareCard(model)
      .then(async (blob) => {
        if (shareGenerationRef.current !== generation) return;
        const file = new File([blob], shareCardFilename(model), {
          type: "image/png",
        });
        const previewUrl = await readBlobAsDataUrl(file);
        if (shareGenerationRef.current !== generation) return;
        const downloadUrl = URL.createObjectURL(file);
        sharePreviewUrlRef.current = downloadUrl;
        setShareAsset({ file, previewUrl, downloadUrl });
        setShareLoading(false);
      })
      .catch(() => {
        if (shareGenerationRef.current !== generation) return;
        setShareLoading(false);
        setShareError("The personalized image could not be created.");
      });
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Exact view link copied.");
      setAnnouncement("View link copied to the clipboard.");
    } catch {
      setShareStatus(
        "Clipboard access was denied. Select the link to copy it.",
      );
    }
  };

  const canShareImage = (() => {
    if (!shareAsset || typeof navigator.canShare !== "function") return false;
    try {
      return navigator.canShare({ files: [shareAsset.file] });
    } catch {
      return false;
    }
  })();
  const hasNativeShare = typeof navigator.share === "function";
  const canCopyImage =
    !!shareAsset &&
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function";

  const shareCurrentView = async () => {
    if (!hasNativeShare) return copyShareLink();
    const covered = Math.round(state.eclipse.obscurationPercent);
    const text = `${location.label}: ${covered}% of the Sun covered at ${selectedTime}. Open the interactive view.`;
    try {
      await navigator.share({
        title: `Solar eclipse ${selectedEclipseId} · ${location.label}`,
        text,
        url: shareUrl,
        ...(canShareImage && shareAsset ? { files: [shareAsset.file] } : {}),
      });
      setAnnouncement("Eclipse view shared.");
      closeShare();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus(
        "Sharing was unavailable. Copy the link or download the image instead.",
      );
    }
  };

  const copyShareImage = async () => {
    if (!shareAsset || !canCopyImage) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": shareAsset.file }),
      ]);
      setShareStatus("Personalized image copied.");
      setAnnouncement("Eclipse image copied to the clipboard.");
    } catch {
      setShareStatus("Image clipboard access was denied. Download it instead.");
    }
  };

  const downloadShareImage = () => {
    if (!shareAsset) return;
    const link = document.createElement("a");
    link.href = shareAsset.downloadUrl;
    link.download = shareAsset.file.name;
    link.click();
    setShareStatus("Personalized image downloaded.");
    setAnnouncement("Eclipse image downloaded.");
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#simulator">
        Skip to simulator
      </a>
      <header className="topbar">
        <button
          className="brand brand-button"
          aria-label="Eclipse Companion home"
          onClick={showNext}
        >
          <span className="brand-mark">◐</span>
          <span>
            ECLIPSE<span>/</span>COMPANION
          </span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button
            type="button"
            aria-current={appView === "next" ? "page" : undefined}
            onClick={showNext}
          >
            Next
          </button>
          <button
            type="button"
            aria-current={appView === "catalog" ? "page" : undefined}
            onClick={() => {
              setAppView("catalog");
              const url = new URL(window.location.href);
              url.searchParams.set("view", "catalog");
              window.history.replaceState(null, "", url);
            }}
          >
            Eclipses
          </button>
          <button
            type="button"
            aria-current={appView === "event" ? "page" : undefined}
            onClick={() => selectEclipse(selectedEclipseId, "event")}
          >
            Event
          </button>
        </nav>
        <div className="topbar-actions">
          <span className="event-date">{selectedEclipseId}</span>
          {appView !== "catalog" && eclipseResult.visible && (
            <>
              <a className="live-nav-link" href="#live">
                <i aria-hidden="true" /> Live view
              </a>
              <button
                ref={shareButtonRef}
                className="secondary-button"
                data-testid="share-view"
                onClick={handleShare}
                title="Share this local eclipse view"
              >
                Share view ↗
              </button>
            </>
          )}
        </div>
      </header>

      {appView === "catalog" ? (
        <main>
          <EclipseCatalog
            records={ECLIPSE_CATALOG}
            selectedId={selectedEclipseId}
            location={location}
            onSelect={(id) => selectEclipse(id, "event")}
          />
        </main>
      ) : (
        <main
          className={`event-page ${eclipseResult.visible ? "" : "not-visible"}`}
        >
          <section className="event-context-bar" aria-label="Selected eclipse">
            <div>
              <span className={`eclipse-type type-${selectedRecord.type}`}>
                {selectedRecord.type}
              </span>
              <strong>
                {new Intl.DateTimeFormat(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${selectedRecord.id}T12:00:00Z`))}
              </strong>
              <small>
                Magnitude {selectedRecord.magnitude.toFixed(4)} · Saros{" "}
                {selectedRecord.saros}
              </small>
            </div>
            <div>
              <a href="#overview">Overview</a>
              <a href="#event-map">Map</a>
              <a href="#simulator">Simulation</a>
              <a href="#circumstances">Circumstances</a>
              <a href="#prepare">Prepare</a>
            </div>
          </section>

          {!eclipseResult.visible && (
            <section className="event-unavailable" id="overview">
              <div>
                <span className="kicker">NOT VISIBLE FROM THIS LOCATION</span>
                <h1>This shadow passes elsewhere.</h1>
                <p>
                  The {selectedRecord.type} eclipse on {selectedRecord.id} does
                  not reach {location.label}. Explore its global map, choose
                  another place, or return to the next eclipse visible from your
                  sky.
                </p>
                <div className="event-unavailable-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={showNext}
                  >
                    Show my next eclipse
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={(event) => openLocation(event.currentTarget)}
                  >
                    Change location
                  </button>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Greatest eclipse</dt>
                  <dd>
                    {selectedRecord.greatestPoint.latitude.toFixed(1)}°,{" "}
                    {selectedRecord.greatestPoint.longitude.toFixed(1)}°
                  </dd>
                </div>
                <div>
                  <dt>Maximum duration</dt>
                  <dd>
                    {formatDuration(selectedRecord.maximumDurationSeconds)}
                  </dd>
                </div>
                <div>
                  <dt>Next total here</dt>
                  <dd>
                    {nextTotalAtLocation?.eventId ?? "Beyond this catalog"}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          <section className="hero" id="overview">
            <div className="hero-copy">
              <p className="eyebrow">
                <span />
                {appView === "next"
                  ? "Next eclipse from your sky"
                  : `${selectedRecord.type} eclipse workspace`}
              </p>
              <h1>
                See the{" "}
                <em>{selectedRecord.type === "annular" ? "ring" : "shadow"}</em>{" "}
                arrive.
              </h1>
              <p className="lede">
                Explore how the Moon crosses the Sun from your sky. Choose a
                place, move through the event, and know exactly where to look.
              </p>
              <a className="hero-live-cta" href="#live">
                <i aria-hidden="true" /> Open the eclipse-day live view
                <span aria-hidden="true">↓</span>
              </a>
              <button
                ref={locationButtonRef}
                className="location-chip"
                data-testid="location-picker"
                aria-haspopup="dialog"
                onClick={(event) => openLocation(event.currentTarget)}
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
                  <dt>
                    {eclipseWindow.localType === "annular"
                      ? "Annularity here"
                      : "Totality here"}
                  </dt>
                  <dd>{formatDuration(centralDurationSeconds)}</dd>
                  <dd className="stat-note">
                    {eclipseWindow.centralStart
                      ? `Calculated ${eclipseWindow.localType} phase`
                      : `${Math.round(eclipseWindow.peakObscuration * 100)}% at maximum`}
                  </dd>
                </div>
                <div>
                  <dt>Next total here</dt>
                  <dd>{nextTotalAtLocation?.eventId ?? "Beyond 2135"}</dd>
                  <dd className="stat-note">For {location.label}</dd>
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
                <SkyCanvas
                  state={state}
                  mode={mode}
                  description={description}
                  showGolfHole={location.label === GOLF_LOCATION_LABEL}
                />
                <div className="scale-note">
                  {mode === "closeup"
                    ? "Magnified equally · overlap remains accurate"
                    : "Disks enlarged equally · altitude and bearing are true"}
                </div>
                <DirectionCompass sun={state.sun} moon={state.moon} />
                <div className="sky-readout">
                  <span>
                    Sun{" "}
                    <strong>
                      {Math.round(state.sun.altitudeDeg)}° altitude
                    </strong>
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

          <section
            className="event-map-workspace"
            id="event-map"
            aria-labelledby="event-map-title"
          >
            <header>
              <span className="kicker">LOCATION & PATH</span>
              <h2 id="event-map-title">Choose your observing point.</h2>
              <p>
                Switch between the bundled eclipse overview and an optional
                detailed map with roads and terrain.
              </p>
            </header>
            {eventPath && nearestCentralPath && (
              <div className="event-map-facts">
                <div>
                  <small>Closest centerline</small>
                  <strong>
                    {Math.round(nearestCentralPath.distanceKm)} km away
                  </strong>
                  <button
                    type="button"
                    onClick={() =>
                      copyCoordinates(
                        nearestCentralPath.coordinate[1],
                        nearestCentralPath.coordinate[0],
                        "Closest centerline",
                      )
                    }
                  >
                    Copy {nearestCentralPath.coordinate[1].toFixed(3)}°,{" "}
                    {nearestCentralPath.coordinate[0].toFixed(3)}°
                  </button>
                </div>
                <div>
                  <small>Greatest eclipse</small>
                  <strong>
                    {selectedRecord.greatestPoint.latitude.toFixed(2)}°,{" "}
                    {selectedRecord.greatestPoint.longitude.toFixed(2)}°
                  </strong>
                  <button
                    type="button"
                    onClick={() =>
                      copyCoordinates(
                        selectedRecord.greatestPoint.latitude,
                        selectedRecord.greatestPoint.longitude,
                        "Greatest eclipse",
                      )
                    }
                  >
                    Copy coordinates
                  </button>
                </div>
                <div>
                  <small>Global maximum</small>
                  <strong>
                    {formatDuration(selectedRecord.maximumDurationSeconds)}
                  </strong>
                  <a
                    href={eventPath.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    NASA path source ↗
                  </a>
                </div>
              </div>
            )}
            <div
              className="map-view-switcher"
              role="group"
              aria-label="Map view"
              data-testid="map-view-toggle"
            >
              <span className="map-view-switcher-label">Map view</span>
              <div className="map-view-switcher-controls">
                <button
                  type="button"
                  aria-pressed={mapView === "overview"}
                  data-testid="map-view-overview"
                  onClick={() => {
                    setMapView("overview");
                    setAnnouncement("Overview map selected.");
                  }}
                >
                  Overview
                </button>
                <button
                  type="button"
                  aria-pressed={mapView === "detail"}
                  data-testid="map-view-detail"
                  onClick={() => {
                    setMapView("detail");
                    setAnnouncement("Detailed map selected.");
                  }}
                >
                  Detailed
                </button>
              </div>
            </div>
            <div className="map-view-stage">
              <div hidden={mapView !== "overview"}>
                <div className="event-overview-map">
                  <EclipseMap
                    location={location}
                    event={selectedRecord}
                    path={eventPath ?? undefined}
                    compact
                  />
                </div>
              </div>
              <div hidden={mapView !== "detail"}>
                <DetailedMap
                  event={selectedRecord}
                  path={eventPath ?? undefined}
                  location={location}
                  onSelect={applyMapCoordinates}
                  active={mapView === "detail"}
                />
              </div>
            </div>
          </section>

          <LiveView
            location={location}
            window={eclipseWindow}
            now={new Date(liveNowMs)}
            formatTime={(date, full) =>
              localDateTime(date, location.timezone, full)
            }
            zoneName={timezoneName(location.timezone, new Date(liveNowMs))}
            onChangeLocation={openLocation}
            onPreviewTime={previewFromLive}
            onOpenSkyGuide={(opener) => {
              alignmentReturnRef.current = opener;
              setShowAlignment(true);
              setAnnouncement("All-sphere sky guide opened.");
            }}
            alertsEnabled={
              alertPreferences.enabled &&
              isEventArmed(alertPreferences, selectedEclipseId) &&
              "Notification" in window &&
              Notification.permission === "granted"
            }
            onConfigureAlerts={(opener) => {
              notificationReturnRef.current = opener;
              setShowNotifications(true);
              setAnnouncement("Eclipse alert setup opened.");
            }}
          />

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
                {eclipseWindow.centralStart && (
                  <div>
                    <small>
                      C2 ·{" "}
                      {eclipseWindow.localType === "annular"
                        ? "ANNULARITY"
                        : "TOTALITY"}{" "}
                      START
                    </small>
                    <strong>
                      {localDateTime(
                        eclipseWindow.centralStart,
                        location.timezone,
                      )}
                    </strong>
                  </div>
                )}
                <div>
                  <small>MAXIMUM</small>
                  <strong>{peakTime}</strong>
                </div>
                {eclipseWindow.centralEnd && (
                  <div>
                    <small>
                      C3 ·{" "}
                      {eclipseWindow.localType === "annular"
                        ? "ANNULARITY"
                        : "TOTALITY"}{" "}
                      END
                    </small>
                    <strong>
                      {localDateTime(
                        eclipseWindow.centralEnd,
                        location.timezone,
                      )}
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
                At maximum, {Math.round(eclipseWindow.peakObscuration * 100)}%
                of the Sun is covered. At the selected time, the Sun is{" "}
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
              onClick={openPath}
            >
              <span className="path-art" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <span className="kicker">THE VERIFIED PATH</span>
                <strong>
                  {selectedEclipseId === DEFAULT_ECLIPSE_ID
                    ? "From the Arctic to Spain."
                    : `Global ${selectedRecord.type} eclipse.`}
                </strong>
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
                browser with Astronomy Engine. The close-up scales both disks
                and their separation together, preserving the visible overlap.
              </p>
              <p>
                Times use your selected IANA time zone. Terrain, clouds,
                atmospheric transparency, and the Moon’s detailed limb profile
                are not modeled, so this is a planning preview rather than
                navigation or safety equipment.
              </p>
            </div>
          </details>
        </main>
      )}

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
          event={selectedRecord}
          path={eventPath ?? undefined}
          onConfirm={applyLocation}
          onClose={closeLocation}
        />
      )}
      {showPath && (
        <PathDialog
          location={location}
          replayTimeMs={nowMs}
          isPlaying={isPlaying}
          onPlayingChange={(playing) => {
            if (playing && nowMs >= PATH_END_MS) setNowMs(PATH_START_MS);
            setIsPlaying(playing);
            setAnnouncement(
              playing ? "Path replay started." : "Path replay paused.",
            );
          }}
          onRestart={() => {
            setNowMs(PATH_START_MS);
            setIsPlaying(true);
            setAnnouncement("Path replay restarted.");
          }}
          onClose={closePath}
        />
      )}
      {showAlignment && (
        <PhoneAlignmentDialog
          location={location}
          eclipseWindow={eclipseWindow}
          now={new Date(liveNowMs)}
          formatTime={(date, full) =>
            localDateTime(date, location.timezone, full)
          }
          onLocationChange={updateAlignmentLocation}
          onClose={() => {
            setShowAlignment(false);
            setAnnouncement("All-sphere sky guide closed.");
            requestAnimationFrame(() => alignmentReturnRef.current?.focus());
          }}
        />
      )}
      {showNotifications && (
        <NotificationDialog
          location={location}
          window={eclipseWindow}
          preferences={alertPreferences}
          formatTime={(date, full) =>
            localDateTime(date, location.timezone, full)
          }
          onSave={(next: AlertPreferences) => {
            setAlertPreferences(next);
            setAnnouncement(
              next.enabled
                ? `Eclipse alerts saved for ${location.label}.`
                : "Eclipse alerts turned off.",
            );
          }}
          onClose={() => {
            setShowNotifications(false);
            setAnnouncement("Eclipse alert setup closed.");
            requestAnimationFrame(() => notificationReturnRef.current?.focus());
          }}
        />
      )}
      {shareUrl && (
        <ShareDialog
          url={shareUrl}
          previewUrl={shareAsset?.previewUrl ?? ""}
          previewAlt={`Personalized solar eclipse card for ${location.label}: ${eventLabel(state)}, ${selectedTime} ${zoneName}.`}
          isLoading={shareLoading}
          error={shareError}
          status={shareStatus}
          nativeShareLabel={
            hasNativeShare
              ? shareLoading
                ? "Preparing image…"
                : canShareImage
                  ? "Share image + link"
                  : "Share link"
              : undefined
          }
          shareDisabled={hasNativeShare && shareLoading}
          canCopyImage={canCopyImage}
          onShare={shareCurrentView}
          onCopyLink={copyShareLink}
          onCopyImage={copyShareImage}
          onDownload={downloadShareImage}
          onClose={closeShare}
        />
      )}
    </div>
  );
}
