import { writeFile } from "node:fs/promises";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json" with { type: "json" };

const WIDTH = 900;
const HEIGHT = 440;
const project = ([longitude, latitude]) => [
  ((longitude + 180) / 360) * WIDTH,
  ((90 - latitude) / 180) * HEIGHT,
];

function linePath(coordinates) {
  return coordinates
    .map((coordinate, index) => {
      const [x, y] = project(coordinate);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

function geometryPath(geometry) {
  if (geometry.type === "Polygon")
    return geometry.coordinates.map((ring) => `${linePath(ring)}Z`).join("");
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates
      .flatMap((polygon) => polygon.map((ring) => `${linePath(ring)}Z`))
      .join("");
  throw new Error(`Unsupported Natural Earth geometry: ${geometry.type}`);
}

const land = feature(landTopology, landTopology.objects.land);
const geometries =
  land.type === "FeatureCollection"
    ? land.features.map((item) => item.geometry)
    : [land.geometry];
const path = geometries.map(geometryPath).join("");
const source = `// Generated from world-atlas 2.0.2 / Natural Earth 1:110m land data.\nexport const NATURAL_EARTH_LAND_PATH = ${JSON.stringify(path)};\n`;
await writeFile(
  new URL("../src/generated-land-path.ts", import.meta.url),
  source,
);
