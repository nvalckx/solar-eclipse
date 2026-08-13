import type { EclipseId, EclipsePathData } from "./types";

const pathModules = import.meta.glob<{ default: EclipsePathData }>(
  "./generated-eclipse-paths/*.json",
);

export async function loadEclipsePath(eventId: EclipseId) {
  const load = pathModules[`./generated-eclipse-paths/${eventId}.json`];
  if (!load) return undefined;
  const module = await load();
  return module.default;
}
