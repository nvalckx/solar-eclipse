import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ECLIPSE_CATALOG_METADATA } from "../eclipse-catalog";
import type {
  EclipseId,
  EclipseRecord,
  EclipseType,
  LocalEclipseSummary,
  ObserverLocation,
} from "../types";

type Props = {
  records: readonly EclipseRecord[];
  selectedId: EclipseId;
  location: ObserverLocation;
  onSelect: (id: EclipseId) => void;
};

const TYPE_LABELS: Record<EclipseType | "all", string> = {
  all: "All types",
  partial: "Partial",
  annular: "Annular",
  total: "Total",
  hybrid: "Hybrid",
};

const visibilityCacheKey = (
  location: ObserverLocation,
  firstId: EclipseId,
  lastId: EclipseId,
) =>
  [
    "eclipse-summaries",
    ECLIPSE_CATALOG_METADATA.version,
    location.latitude.toFixed(5),
    location.longitude.toFixed(5),
    Math.round(location.elevationMeters),
    firstId,
    lastId,
  ].join(":");

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function durationLabel(seconds?: number) {
  if (!seconds) return "Partial eclipse";
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s max`;
}

function localPeakLabel(
  summary: LocalEclipseSummary | undefined,
  location: ObserverLocation,
) {
  if (!summary) return "Calculating local maximum…";
  if (!summary.visible) return "Not visible here";
  const peak = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: location.timezone,
    timeZoneName: "short",
  }).format(new Date(summary.peakUtc));
  const type =
    summary.localType === "total"
      ? "Totality"
      : summary.localType === "annular"
        ? "Annularity"
        : "Partial";
  return `Max here · ${Math.round(summary.coveragePercent)}% covered · ${peak} · ${type}`;
}

export function EclipseCatalog({
  records,
  selectedId,
  location,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [type, setType] = useState<EclipseType | "all">("all");
  const decades = useMemo(
    () =>
      Array.from(
        new Set(
          records.map(
            (record) => Math.floor(Number(record.id.slice(0, 4)) / 10) * 10,
          ),
        ),
      ),
    [records],
  );
  const [decade, setDecade] = useState<number | "all">("all");
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [summaries, setSummaries] = useState<Record<
    string,
    LocalEclipseSummary
  > | null>(null);
  const [visibleLoading, setVisibleLoading] = useState(false);
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    setSummaries(null);
    const cacheKey = visibilityCacheKey(
      location,
      records[0].id,
      records.at(-1)!.id,
    );
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        setSummaries(JSON.parse(cached) as Record<string, LocalEclipseSummary>);
        setVisibleLoading(false);
        return;
      }
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
    setVisibleLoading(true);
    const worker = new Worker(
      new URL("../catalog-summary.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    worker.addEventListener(
      "message",
      (event: MessageEvent<Record<string, LocalEclipseSummary>>) => {
        setSummaries(event.data);
        setVisibleLoading(false);
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify(event.data));
        } catch {
          // Visibility filtering still works when persistence is unavailable.
        }
      },
    );
    worker.addEventListener("error", () => {
      setSummaries({});
      setVisibleLoading(false);
    });
    worker.postMessage({
      latitude: location.latitude,
      longitude: location.longitude,
      elevationMeters: location.elevationMeters,
      startId: records[0].id,
      endId: records.at(-1)!.id,
    });
    return () => worker.terminate();
  }, [location, records]);

  useEffect(() => setLimit(30), [deferredQuery, type, decade, visibleOnly]);

  const filtered = useMemo(
    () =>
      records.filter((record) => {
        if (type !== "all" && record.type !== type) return false;
        if (decade !== "all" && Number(record.id.slice(0, 4)) < decade)
          return false;
        if (decade !== "all" && Number(record.id.slice(0, 4)) >= decade + 10)
          return false;
        if (visibleOnly && (!summaries || !summaries[record.id]?.visible))
          return false;
        if (!deferredQuery) return true;
        return `${record.id} ${record.type} saros ${record.saros}`.includes(
          deferredQuery,
        );
      }),
    [records, type, decade, visibleOnly, summaries, deferredQuery],
  );

  return (
    <section className="catalog-workspace" aria-labelledby="catalog-title">
      <header className="catalog-heading">
        <div>
          <span className="kicker">
            NASA CATALOG · {ECLIPSE_CATALOG_METADATA.range.start.slice(0, 4)}–
            {ECLIPSE_CATALOG_METADATA.range.end.slice(0, 4)}
          </span>
          <h1 id="catalog-title">Every shadow ahead.</h1>
          <p>
            Explore all {records.length} solar eclipses through the total
            eclipse of {ECLIPSE_CATALOG_METADATA.range.end}.
          </p>
        </div>
        <strong>{filtered.length} events</strong>
      </header>

      <div className="catalog-filters" aria-label="Filter eclipses">
        <label className="catalog-search">
          <span>Search date, type, or Saros</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try 2142, total, or Saros 136"
          />
        </label>
        <label>
          <span>Type</span>
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as EclipseType | "all")
            }
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Decade</span>
          <select
            value={decade}
            onChange={(event) =>
              setDecade(
                event.target.value === "all"
                  ? "all"
                  : Number(event.target.value),
              )
            }
          >
            <option value="all">All decades</option>
            {decades.map((value) => (
              <option key={value} value={value}>
                {value}s
              </option>
            ))}
          </select>
        </label>
        <label className="visible-filter">
          <input
            type="checkbox"
            checked={visibleOnly}
            onChange={(event) => setVisibleOnly(event.target.checked)}
          />
          <span>Visible from {location.label}</span>
        </label>
      </div>

      {visibleLoading && visibleOnly ? (
        <p className="catalog-status" role="status">
          Calculating local visibility in the background…
        </p>
      ) : (
        <div className="catalog-grid">
          {filtered.slice(0, limit).map((record) => (
            <button
              type="button"
              key={record.id}
              className={`eclipse-card ${record.id === selectedId ? "selected" : ""}`}
              onClick={() => onSelect(record.id)}
            >
              <span className={`eclipse-type type-${record.type}`}>
                {record.type}
              </span>
              <strong>{formatDate(record.id)}</strong>
              <span>
                Magnitude {record.magnitude.toFixed(4)} · Saros {record.saros}
              </span>
              <small>{localPeakLabel(summaries?.[record.id], location)}</small>
              <small>{durationLabel(record.maximumDurationSeconds)}</small>
              <i aria-hidden="true">Open event →</i>
            </button>
          ))}
        </div>
      )}
      {!visibleLoading && !filtered.length && (
        <p className="catalog-empty">No eclipses match these filters.</p>
      )}
      {limit < filtered.length && (
        <button
          type="button"
          className="catalog-more"
          onClick={() => setLimit((value) => value + 30)}
        >
          Show 30 more
        </button>
      )}
    </section>
  );
}

export default EclipseCatalog;
