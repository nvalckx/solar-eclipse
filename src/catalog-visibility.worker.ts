import * as Astronomy from "astronomy-engine";
import { eclipseNearPeak } from "./eclipse-catalog";

type Request = {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  startId: string;
  endId: string;
};

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const { latitude, longitude, elevationMeters, startId, endId } = event.data;
  const observer = new Astronomy.Observer(latitude, longitude, elevationMeters);
  const visible: string[] = [];
  let eclipse = Astronomy.SearchLocalSolarEclipse(
    new Date(`${startId}T00:00:00Z`),
    observer,
  );
  while (eclipse.peak.time.date <= new Date(`${endId}T23:59:59Z`)) {
    const events = [
      eclipse.partial_begin,
      eclipse.total_begin,
      eclipse.peak,
      eclipse.total_end,
      eclipse.partial_end,
    ].filter((item): item is Astronomy.EclipseEvent => Boolean(item));
    const record = eclipseNearPeak(eclipse.peak.time.date);
    if (record && events.some((item) => item.altitude > -0.833)) {
      visible.push(record.id);
    }
    eclipse = Astronomy.NextLocalSolarEclipse(eclipse.peak.time, observer);
  }
  self.postMessage(visible);
});
