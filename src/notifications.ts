import { eclipseEvents, type EclipseEventKey } from "./live-view";
import type { EclipseId, EclipseWindow, ObserverLocation } from "./types";
import { isEclipseId, LEGACY_ECLIPSE_ID } from "./view-state";

export const ALERTS_STORAGE_KEY = "eclipse26-alerts";
export const ALERT_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60] as const;

export type AlertPreferences = {
  version: 2;
  enabled: boolean;
  leadMinutes: (typeof ALERT_LEAD_OPTIONS)[number];
  eventKeys: EclipseEventKey[];
  armedEventIds: EclipseId[];
};

export type ScheduledAlert = {
  key: EclipseEventKey;
  label: string;
  eventTime: Date;
  notifyAt: Date;
};

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  version: 2,
  enabled: false,
  leadMinutes: 15,
  eventKeys: ["C1", "C2", "MAX"],
  armedEventIds: [],
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
    if (leadMinutes === undefined || !eventKeys.length)
      return DEFAULT_ALERT_PREFERENCES;
    if (candidate.version === 1) {
      return {
        version: 2,
        enabled: candidate.enabled === true,
        leadMinutes,
        eventKeys,
        armedEventIds: candidate.enabled === true ? [LEGACY_ECLIPSE_ID] : [],
      };
    }
    const storedEventIds = candidate.armedEventIds;
    if (candidate.version !== 2 || !Array.isArray(storedEventIds))
      return DEFAULT_ALERT_PREFERENCES;
    const armedEventIds = [...new Set(storedEventIds.filter(isEclipseId))];
    return {
      version: 2,
      enabled: candidate.enabled === true,
      leadMinutes,
      eventKeys,
      armedEventIds,
    };
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

export function serializeAlertPreferences(preferences: AlertPreferences) {
  return JSON.stringify(preferences);
}

export function isEventArmed(
  preferences: AlertPreferences,
  eclipseId: EclipseId,
) {
  return preferences.armedEventIds.includes(eclipseId);
}

export function setEventArmed(
  preferences: AlertPreferences,
  eclipseId: EclipseId,
  armed: boolean,
): AlertPreferences {
  const armedEventIds = preferences.armedEventIds.filter(
    (storedId) => storedId !== eclipseId,
  );
  if (armed) armedEventIds.push(eclipseId);
  return { ...preferences, armedEventIds };
}

export function buildAlertSchedule(
  window: EclipseWindow,
  preferences: AlertPreferences,
  now = new Date(),
): ScheduledAlert[] {
  if (!preferences.enabled || !isEventArmed(preferences, window.eventId))
    return [];
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
    "PRODID:-//Eclipse Companion//Local eclipse alerts//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Solar eclipse ${window.eventId} alerts`,
  ];
  for (const event of events) {
    const start = calendarDate(event.time);
    const end = calendarDate(new Date(event.time.getTime() + 5 * 60_000));
    const coordinates = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:solar-eclipse-${window.eventId}-${event.key.toLowerCase()}-${location.latitude.toFixed(4)}-${location.longitude.toFixed(4)}@local`,
      `DTSTAMP:${generatedAt}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${calendarText(`Solar eclipse ${window.eventId}: ${event.label}`)}`,
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

export function alertCalendarFilename(window: Pick<EclipseWindow, "eventId">) {
  return `solar-eclipse-${window.eventId}-alerts.ics`;
}
