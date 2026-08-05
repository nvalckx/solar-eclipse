import { eclipseEvents, type EclipseEventKey } from "./live-view";
import type { EclipseWindow, ObserverLocation } from "./types";

export const ALERTS_STORAGE_KEY = "eclipse26-alerts";
export const ALERT_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

export type AlertPreferences = {
  version: 1;
  enabled: boolean;
  leadMinutes: (typeof ALERT_LEAD_OPTIONS)[number];
  eventKeys: EclipseEventKey[];
};

export type ScheduledAlert = {
  key: EclipseEventKey;
  label: string;
  eventTime: Date;
  notifyAt: Date;
};

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  version: 1,
  enabled: false,
  leadMinutes: 15,
  eventKeys: ["C1", "C2", "MAX"],
};

const EVENT_KEYS: EclipseEventKey[] = ["C1", "C2", "MAX", "C3", "C4"];

export function parseStoredAlertPreferences(
  raw: string | null,
): AlertPreferences {
  if (!raw) return DEFAULT_ALERT_PREFERENCES;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return DEFAULT_ALERT_PREFERENCES;
    const candidate = value as Record<string, unknown>;
    const leadMinutes = ALERT_LEAD_OPTIONS.find(
      (option) => option === candidate.leadMinutes,
    );
    const storedEventKeys = candidate.eventKeys;
    const eventKeys = Array.isArray(storedEventKeys)
      ? EVENT_KEYS.filter((key) => storedEventKeys.includes(key))
      : [];
    if (
      candidate.version !== 1 ||
      leadMinutes === undefined ||
      !eventKeys.length
    )
      return DEFAULT_ALERT_PREFERENCES;
    return {
      version: 1,
      enabled: candidate.enabled === true,
      leadMinutes,
      eventKeys,
    };
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

export function serializeAlertPreferences(preferences: AlertPreferences) {
  return JSON.stringify(preferences);
}

export function buildAlertSchedule(
  window: EclipseWindow,
  preferences: AlertPreferences,
  now = new Date(),
): ScheduledAlert[] {
  const leadMs = preferences.leadMinutes * 60_000;
  return eclipseEvents(window)
    .filter((event) => preferences.eventKeys.includes(event.key))
    .map((event) => ({
      ...event,
      eventTime: event.time,
      notifyAt: new Date(event.time.getTime() - leadMs),
    }))
    .filter((event) => event.notifyAt.getTime() > now.getTime());
}

export function alertBody(
  alert: ScheduledAlert,
  location: ObserverLocation,
  leadMinutes: number,
) {
  if (leadMinutes === 0)
    return `${alert.label} is happening now at ${location.label}.`;
  return `${alert.label} is in ${leadMinutes} minutes at ${location.label}.`;
}

function calendarDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function calendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildAlertCalendar(
  window: EclipseWindow,
  location: ObserverLocation,
  preferences: AlertPreferences,
) {
  const generatedAt = calendarDate(new Date());
  const events = eclipseEvents(window).filter((event) =>
    preferences.eventKeys.includes(event.key),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eclipse 26//Local eclipse alerts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Eclipse/26 alerts",
  ];
  for (const event of events) {
    const start = calendarDate(event.time);
    const end = calendarDate(new Date(event.time.getTime() + 5 * 60_000));
    const coordinates = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:eclipse26-${event.key.toLowerCase()}-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}@local`,
      `DTSTAMP:${generatedAt}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${calendarText(`Eclipse/26 — ${event.label}`)}`,
      `DESCRIPTION:${calendarText(`Local eclipse contact for ${location.label}. Calculated for ${coordinates}.`)}`,
      `LOCATION:${calendarText(location.label)}`,
      "BEGIN:VALARM",
      `TRIGGER:${preferences.leadMinutes ? `-PT${preferences.leadMinutes}M` : "PT0M"}`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${calendarText(`${event.label} at ${location.label}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
