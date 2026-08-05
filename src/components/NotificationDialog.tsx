import { useEffect, useRef, useState } from "react";
import { eclipseEvents } from "../live-view";
import {
  ALERT_LEAD_OPTIONS,
  buildAlertCalendar,
  type AlertPreferences,
} from "../notifications";
import type { EclipseWindow, ObserverLocation } from "../types";

type Props = {
  location: ObserverLocation;
  window: EclipseWindow;
  preferences: AlertPreferences;
  formatTime: (date: Date, full?: boolean) => string;
  onSave: (preferences: AlertPreferences) => void;
  onClose: () => void;
};

type BrowserPermission = NotificationPermission | "unsupported";

function browserPermission(): BrowserPermission {
  return "Notification" in globalThis ? Notification.permission : "unsupported";
}

export function NotificationDialog({
  location,
  window,
  preferences,
  formatTime,
  onSave,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(preferences);
  const [permission, setPermission] =
    useState<BrowserPermission>(browserPermission);
  const [message, setMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const events = eclipseEvents(window);

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

  const toggleEvent = (key: (typeof events)[number]["key"]) => {
    setDraft((current) => ({
      ...current,
      eventKeys: current.eventKeys.includes(key)
        ? current.eventKeys.filter((item) => item !== key)
        : [...current.eventKeys, key],
    }));
  };

  const enableAlerts = async () => {
    if (!draft.eventKeys.length) {
      setMessage("Choose at least one eclipse moment first.");
      return;
    }
    setRequesting(true);
    let nextPermission = browserPermission();
    if (nextPermission === "default") {
      try {
        nextPermission = await Notification.requestPermission();
      } catch {
        nextPermission = "denied";
      }
    }
    setPermission(nextPermission);
    setRequesting(false);
    if (nextPermission === "granted") {
      const next = { ...draft, enabled: true };
      setDraft(next);
      onSave(next);
      setMessage(`Alerts saved for ${location.label}.`);
    } else if (nextPermission === "denied") {
      setMessage(
        "Browser alerts are blocked. You can allow them in site settings or use the calendar option.",
      );
    }
  };

  const saveAlerts = () => {
    if (!draft.eventKeys.length) {
      setMessage("Choose at least one eclipse moment first.");
      return;
    }
    onSave({ ...draft, enabled: true });
    setMessage(`Alerts updated for ${location.label}.`);
  };

  const disableAlerts = () => {
    const next = { ...draft, enabled: false };
    setDraft(next);
    onSave(next);
    setMessage("Browser alerts are off.");
  };

  const downloadCalendar = () => {
    if (!draft.eventKeys.length) {
      setMessage("Choose at least one eclipse moment first.");
      return;
    }
    const blob = new Blob([buildAlertCalendar(window, location, draft)], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "eclipse-26-alerts.ics";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Calendar file downloaded with your selected reminders.");
  };

  const active = draft.enabled && permission === "granted";
  const canRequest = permission === "default" || permission === "granted";

  return (
    <dialog
      ref={dialogRef}
      className="dialog notification-dialog"
      aria-labelledby="notification-dialog-title"
      data-testid="notification-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-card">
        <header className="dialog-header">
          <div>
            <span className="kicker">ECLIPSE REMINDERS</span>
            <h2 id="notification-dialog-title">Don’t miss the shadow.</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close eclipse alerts"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="notification-layout">
          <div className="notification-location">
            <span className="notification-bell" aria-hidden="true">
              ◒
            </span>
            <div>
              <small>ALERTS FOR YOUR SET LOCATION</small>
              <strong>{location.label}</strong>
              <span>
                {Math.abs(location.latitude).toFixed(2)}°{" "}
                {location.latitude >= 0 ? "N" : "S"}
                {" · "}
                {Math.abs(location.longitude).toFixed(2)}°{" "}
                {location.longitude >= 0 ? "E" : "W"}
              </span>
            </div>
            <span className={`alert-state ${active ? "active" : ""}`}>
              {active ? "Alerts on" : "Alerts off"}
            </span>
          </div>

          <fieldset className="notification-events">
            <legend>Choose the moments that matter</legend>
            <p>
              Times are calculated for this location and update when you move
              your pin.
            </p>
            <div>
              {events.map((event) => (
                <label key={event.key}>
                  <input
                    type="checkbox"
                    checked={draft.eventKeys.includes(event.key)}
                    onChange={() => toggleEvent(event.key)}
                  />
                  <span className="event-code">{event.key}</span>
                  <span>
                    <strong>{event.label}</strong>
                    <small>{formatTime(event.time, true)}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="reminder-time">
            <span>
              <strong>Remind me before each moment</strong>
              <small>One alert per selected eclipse contact</small>
            </span>
            <select
              aria-label="Reminder time"
              value={draft.leadMinutes}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  leadMinutes: Number(
                    event.target.value,
                  ) as AlertPreferences["leadMinutes"],
                }))
              }
            >
              {ALERT_LEAD_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0
                    ? "At event time"
                    : `${minutes} minutes before`}
                </option>
              ))}
            </select>
          </label>

          <div className="notification-note">
            <strong>Keep this page open for browser alerts.</strong>
            <p>
              Browsers cannot guarantee scheduled alerts after a static page is
              closed. Download the calendar file for dependable reminders from
              your phone or calendar app.
            </p>
          </div>

          {message && (
            <p className="dialog-status" role="status" aria-live="polite">
              {message}
            </p>
          )}
        </div>

        <footer className="dialog-actions notification-actions">
          {preferences.enabled && (
            <button className="text-button" onClick={disableAlerts}>
              Turn off alerts
            </button>
          )}
          <button className="secondary-button" onClick={downloadCalendar}>
            Add to calendar ↓
          </button>
          {canRequest ? (
            <button
              className="primary-button"
              data-testid="enable-notifications"
              disabled={requesting}
              onClick={active ? saveAlerts : enableAlerts}
            >
              {requesting
                ? "Asking permission…"
                : active
                  ? "Save alerts"
                  : "Enable browser alerts"}
            </button>
          ) : (
            <button className="primary-button" onClick={downloadCalendar}>
              Use calendar alerts
            </button>
          )}
        </footer>
      </div>
    </dialog>
  );
}
