import type * as Astronomy from "astronomy-engine";

export type LocationSource = "preset" | "geolocation" | "coordinates";
export type SkyMode = "sky" | "closeup";
export type EclipseId = `${number}-${number}-${number}`;
export type EclipseType = "partial" | "annular" | "total" | "hybrid";
export type AppView = "next" | "catalog" | "event";

export type ObserverLocation = {
  latitude: number;
  longitude: number;
  elevationMeters: number;
  label: string;
  timezone: string;
  source: LocationSource;
};

export type HorizontalPosition = {
  azimuthDeg: number;
  altitudeDeg: number;
  angularDiameterDeg: number;
  distanceKm: number;
};

export type EclipseCircumstances = {
  visible: boolean;
  type: "none" | "partial" | "annular" | "total";
  firstContact: string;
  secondContact?: string;
  maximum: string;
  thirdContact?: string;
  fourthContact: string;
  obscurationPercent: number;
  magnitude: number;
};

export type SkyState = {
  timestampUtc: string;
  sun: HorizontalPosition;
  moon: HorizontalPosition;
  eclipse: EclipseCircumstances;
  twilightLevel: "day" | "civil" | "nautical" | "astronomical" | "night";
};

export type EclipseWindow = {
  eventId: EclipseId;
  globalType: EclipseType;
  localType: Exclude<EclipseCircumstances["type"], "none">;
  phaseLabel: string;
  start: Date;
  peak: Date;
  end: Date;
  centralStart?: Date;
  centralEnd?: Date;
  totalStart?: Date;
  totalEnd?: Date;
  totalityDurationSeconds?: number;
  kind: Astronomy.EclipseKind;
  peakObscuration: number;
  visible: boolean;
  sourceUrl: string;
};

export type EclipseRecord = {
  id: EclipseId;
  peakUtc: string;
  type: EclipseType;
  nasaType: string;
  catalogNumber: number;
  saros: number;
  gamma: number;
  magnitude: number;
  greatestPoint: { latitude: number; longitude: number };
  sunAltitudeDeg: number;
  pathWidthKm?: number;
  maximumDurationSeconds?: number;
  mapUrl: string;
  pathUrl?: string;
};

export type EclipsePathData = {
  eventId: EclipseId;
  sourceUrl: string;
  sourceSha256: string;
  spacingDegrees: number;
  north: ReadonlyArray<readonly [number, number]>;
  centerline: ReadonlyArray<readonly [number, number]>;
  south: ReadonlyArray<readonly [number, number]>;
};

export type VisibilityContour = {
  obscurationPercent: number;
  coordinates: ReadonlyArray<readonly [number, number]>;
};

export type LocalEclipseResult =
  | {
      visible: false;
      eventId: EclipseId;
      record: EclipseRecord;
      reason: "not-visible";
    }
  | {
      visible: true;
      eventId: EclipseId;
      record: EclipseRecord;
      window: EclipseWindow;
    };

export type MapProviderState = "bundled" | "loading" | "online" | "error";

export type MapViewport = {
  latitude: number;
  longitude: number;
  zoom: number;
};

export type SharedView = {
  version: 1 | 2;
  eclipseId?: EclipseId;
  location: ObserverLocation;
  timestamp?: Date;
  mode: SkyMode;
};
