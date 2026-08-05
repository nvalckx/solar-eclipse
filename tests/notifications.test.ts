import { describe, expect, test } from "vitest";
import { eclipseWindowFor } from "../src/eclipse-logic";
import {
  alertBody,
  buildAlertCalendar,
  buildAlertSchedule,
  DEFAULT_ALERT_PREFERENCES,
  parseStoredAlertPreferences,
  serializeAlertPreferences,
} from "../src/notifications";
import type { ObserverLocation } from "../src/types";

const zaragoza: ObserverLocation = {
  latitude: 41.65,
  longitude: -0.89,
  elevationMeters: 250,
  label: "Zaragoza, Spain",
  timezone: "Europe/Madrid",
  source: "preset",
};

describe("local eclipse alerts", () => {
  const window = eclipseWindowFor(zaragoza);

  test("persists only valid alert preferences", () => {
    const preferences = {
      ...DEFAULT_ALERT_PREFERENCES,
      enabled: true,
      leadMinutes: 30 as const,
      eventKeys: ["C1", "MAX", "C4"] as const,
    };
    expect(
      parseStoredAlertPreferences(
        serializeAlertPreferences({
          ...preferences,
          eventKeys: [...preferences.eventKeys],
        }),
      ),
    ).toEqual(preferences);
    expect(parseStoredAlertPreferences('{"leadMinutes":999}')).toEqual(
      DEFAULT_ALERT_PREFERENCES,
    );
  });

  test("builds future reminders from selected local contacts", () => {
    const schedule = buildAlertSchedule(
      window,
      {
        ...DEFAULT_ALERT_PREFERENCES,
        eventKeys: ["C1", "MAX", "C4"],
        leadMinutes: 30,
      },
      new Date(window.start.getTime() - 31 * 60_000),
    );
    expect(schedule.map((alert) => alert.key)).toEqual(["C1", "MAX", "C4"]);
    expect(
      schedule[0].eventTime.getTime() - schedule[0].notifyAt.getTime(),
    ).toBe(30 * 60_000);
    expect(alertBody(schedule[0], zaragoza, 30)).toContain(
      "in 30 minutes at Zaragoza, Spain",
    );
  });

  test("exports standards-based calendar alarms for background reminders", () => {
    const calendar = buildAlertCalendar(window, zaragoza, {
      ...DEFAULT_ALERT_PREFERENCES,
      eventKeys: ["C2", "MAX"],
    });
    expect(calendar).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain("TRIGGER:-PT15M");
    expect(calendar).toContain("LOCATION:Zaragoza\\, Spain");
    expect(calendar).toContain("SUMMARY:Eclipse/26 — Totality begins");
  });
});
