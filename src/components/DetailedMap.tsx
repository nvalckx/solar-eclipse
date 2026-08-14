import { useEffect, useId, useRef, useState } from "react";
import { TOTALITY_BAND, TOTALITY_CENTERLINE } from "../map-data";
import type {
  EclipsePathData,
  EclipseRecord,
  MapProviderState,
  MapViewport,
  ObserverLocation,
} from "../types";
import "../detailed-map.css";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletLayerGroup = import("leaflet").LayerGroup;
type LeafletTileLayer = import("leaflet").TileLayer;

type Props = {
  event: EclipseRecord;
  path?: EclipsePathData;
  location: ObserverLocation;
  onSelect: (latitude: number, longitude: number) => void;
  active?: boolean;
  requestLoad?: boolean;
  onProviderError?: () => void;
  viewport?: MapViewport;
  onViewportChange?: (viewport: MapViewport) => void;
  className?: string;
};

const CARTO_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ESRI_HILLSHADE_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, USGS, NOAA';

const toLatLng = ([longitude, latitude]: readonly [number, number]) =>
  [latitude, longitude] as [number, number];

function splitAtAntimeridian(
  coordinates: ReadonlyArray<readonly [number, number]>,
) {
  return coordinates.reduce<Array<Array<[number, number]>>>(
    (segments, point) => {
      const current = segments.at(-1)!;
      const previous = current.at(-1);
      if (previous && Math.abs(point[0] - previous[1]) > 180) {
        segments.push([]);
      }
      segments.at(-1)!.push(toLatLng(point));
      return segments;
    },
    [[]],
  );
}

function drawEventOverlays(
  leaflet: LeafletModule,
  group: LeafletLayerGroup,
  event: EclipseRecord,
  path?: EclipsePathData,
) {
  group.clearLayers();

  const greatest = leaflet.circleMarker(
    [event.greatestPoint.latitude, event.greatestPoint.longitude],
    {
      radius: 7,
      color: "#f6c85f",
      fillColor: "#12131b",
      fillOpacity: 1,
      weight: 3,
    },
  );
  greatest.bindTooltip(
    `<strong>Greatest eclipse</strong><br>${event.greatestPoint.latitude.toFixed(2)}°, ${event.greatestPoint.longitude.toFixed(2)}°`,
  );
  group.addLayer(greatest);

  if (path) {
    const addLimit = (
      coordinates: ReadonlyArray<readonly [number, number]>,
    ) => {
      splitAtAntimeridian(coordinates).forEach((segment) => {
        if (segment.length > 1) {
          group.addLayer(
            leaflet.polyline(segment, {
              color: "#f5d878",
              weight: 1.8,
              opacity: 0.88,
              interactive: false,
            }),
          );
        }
      });
    };
    addLimit(path.north);
    addLimit(path.south);
    splitAtAntimeridian(path.centerline).forEach((segment) => {
      if (segment.length > 1) {
        group.addLayer(
          leaflet.polyline(segment, {
            color: "#fff3bd",
            weight: 2.5,
            opacity: 0.95,
            interactive: false,
          }),
        );
      }
    });
  } else if (event.id === "2026-08-12") {
    group.addLayer(
      leaflet.polygon(TOTALITY_BAND.map(toLatLng), {
        color: "#f5d878",
        fillColor: "#675d8e",
        fillOpacity: 0.2,
        weight: 1.5,
        interactive: false,
      }),
    );
    group.addLayer(
      leaflet.polyline(
        TOTALITY_CENTERLINE.map(({ coordinate }) => toLatLng(coordinate)),
        {
          color: "#fff3bd",
          weight: 2.5,
          opacity: 0.95,
          interactive: false,
        },
      ),
    );
  }

  if (event.id === "2026-08-12")
    TOTALITY_CENTERLINE.filter((_, index) => index % 5 === 0).forEach(
      ({ coordinate, timeUtc }) => {
        const timeMarker = leaflet.circleMarker(toLatLng(coordinate), {
          radius: 3,
          color: "#fff3bd",
          fillColor: "#fff3bd",
          fillOpacity: 1,
          weight: 1,
        });
        timeMarker.bindTooltip(`${timeUtc} UTC`, { direction: "top" });
        group.addLayer(timeMarker);
      },
    );
}

export function DetailedMap({
  event,
  path,
  location,
  onSelect,
  active = true,
  requestLoad = false,
  onProviderError,
  viewport,
  onViewportChange,
  className,
}: Props) {
  const helpId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const overlayGroupRef = useRef<LeafletLayerGroup | null>(null);
  const hillshadeLayerRef = useRef<LeafletTileLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  const eventRef = useRef(event);
  const pathRef = useRef(path);
  const locationRef = useRef(location);
  const onProviderErrorRef = useRef(onProviderError);
  const onViewportChangeRef = useRef(onViewportChange);
  const viewportRef = useRef(viewport);
  const [enabled, setEnabled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [providerState, setProviderState] =
    useState<MapProviderState>("bundled");
  const [hillshade, setHillshade] = useState(false);
  const [hillshadeError, setHillshadeError] = useState(false);

  onSelectRef.current = onSelect;
  eventRef.current = event;
  pathRef.current = path;
  locationRef.current = location;
  onProviderErrorRef.current = onProviderError;
  onViewportChangeRef.current = onViewportChange;
  viewportRef.current = viewport;

  useEffect(() => {
    if (requestLoad) setEnabled(true);
  }, [requestLoad]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let map: LeafletMap | null = null;
    setProviderState("loading");

    void Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
      .then(([module]) => {
        if (cancelled || !containerRef.current) return;

        const leaflet = module.default;
        leafletRef.current = leaflet;
        map = leaflet.map(containerRef.current, {
          center: [
            viewportRef.current?.latitude ?? locationRef.current.latitude,
            viewportRef.current?.longitude ?? locationRef.current.longitude,
          ],
          zoom: viewportRef.current?.zoom ?? 1,
          minZoom: 1,
          maxZoom: 18,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          zoomControl: true,
          attributionControl: true,
          keyboard: true,
          scrollWheelZoom: true,
          touchZoom: true,
        });
        mapRef.current = map;

        const carto = leaflet.tileLayer(CARTO_TILES, {
          attribution: CARTO_ATTRIBUTION,
          subdomains: "abcd",
          maxZoom: 20,
          crossOrigin: true,
        });
        let baseTilesFailed = false;
        carto.once("tileerror", () => {
          baseTilesFailed = true;
          if (!cancelled) {
            setProviderState("error");
            onProviderErrorRef.current?.();
          }
        });
        carto.once("load", () => {
          if (!cancelled && !baseTilesFailed) setProviderState("online");
        });
        carto.addTo(map);

        const hillshadeLayer = leaflet.tileLayer(ESRI_HILLSHADE_TILES, {
          attribution: ESRI_ATTRIBUTION,
          maxZoom: 13,
          opacity: 0.56,
          crossOrigin: true,
        });
        hillshadeLayer.on("tileerror", () => {
          if (!cancelled) {
            setHillshadeError(true);
            setHillshade(false);
          }
        });
        hillshadeLayerRef.current = hillshadeLayer;

        const marker = leaflet.marker(
          [locationRef.current.latitude, locationRef.current.longitude],
          {
            draggable: true,
            keyboard: true,
            title: "Selected observing location",
            alt: "Selected observing location",
            icon: leaflet.divIcon({
              className: "detailed-map-location-icon",
              html: '<span aria-hidden="true"></span>',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            }),
          },
        );
        marker.on("dragend", () => {
          const selected = marker.getLatLng();
          onSelectRef.current(selected.lat, selected.lng);
        });
        marker.addTo(map);
        markerRef.current = marker;

        map.on("click", ({ latlng }) => {
          marker.setLatLng(latlng);
          onSelectRef.current(latlng.lat, latlng.lng);
        });

        const reportViewport = () => {
          const center = map?.getCenter();
          if (!center) return;
          onViewportChangeRef.current?.({
            latitude: center.lat,
            longitude: center.lng,
            zoom: map?.getZoom() ?? viewportRef.current?.zoom ?? 1,
          });
        };
        map.on("moveend zoomend", reportViewport);

        const overlays = leaflet.layerGroup().addTo(map);
        overlayGroupRef.current = overlays;
        drawEventOverlays(leaflet, overlays, eventRef.current, pathRef.current);
      })
      .catch(() => {
        if (!cancelled) {
          setProviderState("error");
          onProviderErrorRef.current?.();
        }
      });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
      overlayGroupRef.current = null;
      hillshadeLayerRef.current = null;
      leafletRef.current = null;
    };
  }, [attempt, enabled]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    marker.setLatLng([location.latitude, location.longitude]);
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !viewport || !active) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (
      Math.abs(center.lat - viewport.latitude) > 0.000001 ||
      Math.abs(center.lng - viewport.longitude) > 0.000001 ||
      Math.abs(zoom - viewport.zoom) > 0.001
    ) {
      map.setView([viewport.latitude, viewport.longitude], viewport.zoom, {
        animate: false,
      });
    }
  }, [active, viewport]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const overlays = overlayGroupRef.current;
    if (!leaflet || !overlays) return;
    drawEventOverlays(leaflet, overlays, event, path);
  }, [event, path]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = hillshadeLayerRef.current;
    if (!map || !layer) return;
    if (hillshade) layer.addTo(map);
    else layer.removeFrom(map);
  }, [hillshade, providerState]);

  const loadMap = () => {
    setEnabled(true);
    setProviderState("loading");
  };

  const retry = () => {
    setHillshade(false);
    setHillshadeError(false);
    setProviderState("loading");
    setAttempt((value) => value + 1);
  };

  const toggleHillshade = (checked: boolean) => {
    setHillshadeError(false);
    setHillshade(checked);
  };

  return (
    <section
      className={`detailed-map-panel ${className ?? ""}`.trim()}
      aria-label="Detailed online location map"
      data-provider-state={providerState}
    >
      {!enabled ? (
        <div
          className="detailed-map-consent"
          data-testid="detailed-map-consent"
        >
          <div>
            <p className="detailed-map-eyebrow">Optional online detail</p>
            <h3>Load roads, places and terrain</h3>
            <p>
              The eclipse calculations and bundled map work without this.
              Loading online detail shares your network address and the visible
              map area with CARTO. OpenStreetMap is credited as the map-data
              source; Esri is contacted only if you turn on hillshade.
            </p>
          </div>
          <button type="button" className="detailed-map-load" onClick={loadMap}>
            Load detailed map
          </button>
        </div>
      ) : (
        <>
          <div className="detailed-map-toolbar">
            <div>
              <span className="detailed-map-status" aria-live="polite">
                {providerState === "loading"
                  ? "Loading map…"
                  : providerState === "online"
                    ? "Online detail loaded"
                    : providerState === "error"
                      ? "Online map unavailable"
                      : "Bundled map"}
              </span>
              <span className="detailed-map-coordinates">
                {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}
                °
              </span>
            </div>
            <label className="detailed-map-layer-toggle">
              <input
                type="checkbox"
                checked={hillshade}
                disabled={providerState !== "online"}
                onChange={(changeEvent) =>
                  toggleHillshade(changeEvent.currentTarget.checked)
                }
              />
              Terrain hillshade
            </label>
          </div>
          {hillshadeError && (
            <p className="detailed-map-terrain-error" role="status">
              Terrain tiles are unavailable; the detailed base map is still
              working.
            </p>
          )}
          <div
            ref={containerRef}
            className="detailed-map-canvas"
            role="region"
            aria-label={`Interactive map for the ${event.id} eclipse near ${location.label}`}
            aria-describedby={helpId}
            aria-busy={providerState === "loading"}
            data-testid="detailed-map"
          />
          {providerState === "loading" && (
            <div className="detailed-map-loading" role="status">
              Preparing detailed map…
            </div>
          )}
          {providerState === "error" && (
            <div className="detailed-map-error" role="alert">
              <div>
                <strong>Online map tiles could not be loaded.</strong>
                <span>
                  Your selected coordinates and eclipse results are unchanged.
                  Use the bundled map or try again.
                </span>
              </div>
              <button type="button" onClick={retry}>
                Try again
              </button>
            </div>
          )}
          <p className="detailed-map-help" id={helpId}>
            Click or drag the marker to choose a location. Use +/−, scroll,
            pinch, or the keyboard to zoom and pan.
          </p>
        </>
      )}
    </section>
  );
}

export default DetailedMap;
