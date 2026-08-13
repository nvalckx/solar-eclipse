import generatedCatalog from "./generated-eclipse-catalog.json";
import type { EclipseId, EclipseRecord, EclipseType } from "./types";

export type EclipseCatalogMetadata = {
  version: number;
  generatedAt: string;
  range: { start: EclipseId; end: EclipseId };
  attribution: string;
  sources: ReadonlyArray<{ url: string; sha256: string }>;
  tolerances?: Readonly<{ eventMatchHours: number; magnitude: number }>;
};

type GeneratedRecord = Omit<EclipseRecord, "id" | "type"> & {
  id: string;
  type: string;
};

type GeneratedCatalog = Omit<EclipseCatalogMetadata, "range"> & {
  range: { start: string; end: string };
  records: GeneratedRecord[];
};

const raw = generatedCatalog as GeneratedCatalog;
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = new Set<EclipseType>(["partial", "annular", "total", "hybrid"]);

function asEclipseId(value: string): EclipseId {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid eclipse ID in generated catalog: ${value}`);
  }
  return value as EclipseId;
}

function asEclipseType(value: string): EclipseType {
  if (!TYPES.has(value as EclipseType)) {
    throw new Error(`Invalid eclipse type in generated catalog: ${value}`);
  }
  return value as EclipseType;
}

export const ECLIPSE_CATALOG: readonly EclipseRecord[] = raw.records.map(
  (record) => ({
    ...record,
    id: asEclipseId(record.id),
    type: asEclipseType(record.type),
  }),
);

export const ECLIPSE_CATALOG_METADATA: EclipseCatalogMetadata = {
  version: raw.version,
  generatedAt: raw.generatedAt,
  range: {
    start: asEclipseId(raw.range.start),
    end: asEclipseId(raw.range.end),
  },
  attribution: raw.attribution,
  sources: raw.sources,
  tolerances: raw.tolerances,
};

const RECORDS_BY_ID = new Map(
  ECLIPSE_CATALOG.map((record) => [record.id, record]),
);

export function eclipseById(id: EclipseId | string) {
  return RECORDS_BY_ID.get(id as EclipseId);
}

/** Matches a local peak instant to its global catalog event across UTC dates. */
export function eclipseNearPeak(peak: Date, toleranceMs = 48 * 60 * 60 * 1000) {
  let closest: EclipseRecord | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const record of ECLIPSE_CATALOG) {
    const distance = Math.abs(
      new Date(record.peakUtc).getTime() - peak.getTime(),
    );
    if (distance < closestDistance) {
      closest = record;
      closestDistance = distance;
    }
  }
  return closest && closestDistance <= toleranceMs ? closest : undefined;
}

export function upcomingEclipses(from: Date = new Date()) {
  const instant = from.getTime();
  return ECLIPSE_CATALOG.filter(
    (record) => new Date(record.peakUtc).getTime() >= instant,
  );
}

export function eclipsesInDecade(decade: number) {
  return ECLIPSE_CATALOG.filter(
    (record) => Math.floor(Number(record.id.slice(0, 4)) / 10) * 10 === decade,
  );
}
