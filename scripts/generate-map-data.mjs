import { writeFile } from "node:fs/promises";
import { feature } from "topojson-client";
import landTopology from "world-atlas/land-110m.json" with { type: "json" };

const WIDTH = 900;
const HEIGHT = 440;
const project = ([longitude, latitude]) => [
  ((longitude + 180) / 360) * WIDTH,
  ((90 - latitude) / 180) * HEIGHT,
];

function linePaths(coordinates) {
  const paths = [];
  let current = [];

  for (const coordinate of coordinates) {
    const point = project(coordinate);
    const previous = current.at(-1);

    // A Natural Earth ring can cross the ±180° meridian. In an equirectangular
    // SVG, connecting those points directly draws a false line across the map.
    if (previous && Math.abs(point[0] - previous[0]) > WIDTH / 2) {
      paths.push(current);
      current = [];
    }
    current.push(point);
  }

  if (current.length) paths.push(current);
  if (paths.length < 2) return paths;

  // A ring may start between two seam crossings. Join the fragments that
  // meet at the ring's start point so each closed fragment spans seam to seam.
  const first = paths.shift();
  const last = paths.pop();
  return [[...(last ?? []), ...(first?.slice(1) ?? [])], ...paths];
}

function linePath(points) {
  return points
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`,
    )
    .join("");
}

function ringPath(coordinates) {
  return linePaths(coordinates)
    .map((points) => `${linePath(points)}Z`)
    .join("");
}

function geometryPath(geometry) {
  if (geometry.type === "Polygon")
    return geometry.coordinates.map(ringPath).join("");
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates
      .flatMap((polygon) => polygon.map(ringPath))
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
