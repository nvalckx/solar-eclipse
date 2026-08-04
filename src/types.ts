import type * as Astronomy from "astronomy-engine";

export type LocationSource = "preset" | "geolocation" | "coordinates";
export type SkyMode = "sky" | "closeup";

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
  type: "none" | "partial" | "total";
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
  start: Date;
  peak: Date;
  end: Date;
  totalStart?: Date;
  totalEnd?: Date;
  totalityDurationSeconds?: number;
  kind: Astronomy.EclipseKind;
  peakObscuration: number;
};

export type SharedView = {
  version: 1;
  location: ObserverLocation;
  timestamp?: Date;
  mode: SkyMode;
};
