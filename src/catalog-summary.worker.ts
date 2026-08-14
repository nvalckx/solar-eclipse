import * as Astronomy from "astronomy-engine";
import { eclipseNearPeak } from "./eclipse-catalog";
import type { LocalEclipseSummary } from "./types";

type Request = {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  startId: string;
  endId: string;
};

type Response = Record<string, LocalEclipseSummary>;

const VISIBLE_SUN_ALTITUDE_DEG = -0.833;

function localTypeFor(
  kind: Astronomy.EclipseKind,
): LocalEclipseSummary["localType"] {
  switch (kind) {
    case Astronomy.EclipseKind.Total:
      return "total";
    case Astronomy.EclipseKind.Annular:
      return "annular";
    default:
      return "partial";
  }
}

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const { latitude, longitude, elevationMeters, startId, endId } = event.data;
  const observer = new Astronomy.Observer(latitude, longitude, elevationMeters);
  const summaries: Response = {};
  let eclipse = Astronomy.SearchLocalSolarEclipse(
    new Date(`${startId}T00:00:00Z`),
    observer,
  );
  const end = new Date(`${endId}T23:59:59Z`);

  while (eclipse.peak.time.date <= end) {
    const events = [
      eclipse.partial_begin,
      eclipse.total_begin,
      eclipse.peak,
      eclipse.total_end,
      eclipse.partial_end,
    ].filter((item): item is Astronomy.EclipseEvent => Boolean(item));
    const record = eclipseNearPeak(eclipse.peak.time.date);

    if (record) {
      const visible = events.some(
        (item) => item.altitude > VISIBLE_SUN_ALTITUDE_DEG,
      );
      const centralDurationSeconds =
        eclipse.total_begin && eclipse.total_end
          ? (eclipse.total_end.time.date.getTime() -
              eclipse.total_begin.time.date.getTime()) /
            1000
          : undefined;
      summaries[record.id] = {
        visible,
        peakUtc: eclipse.peak.time.date.toISOString(),
        coveragePercent: visible ? eclipse.obscuration * 100 : 0,
        localType: visible ? localTypeFor(eclipse.kind) : undefined,
        centralDurationSeconds: visible ? centralDurationSeconds : undefined,
      };
    }

    eclipse = Astronomy.NextLocalSolarEclipse(eclipse.peak.time, observer);
  }

  self.postMessage(summaries satisfies Response);
});
