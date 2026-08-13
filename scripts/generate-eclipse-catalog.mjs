import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SOURCES = [
  "https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html",
  "https://eclipse.gsfc.nasa.gov/SEcat5/SE2101-2200.html",
];
const START_ID = "2026-08-12";
const END_ID = "2135-10-07";
const PLACES_SOURCE =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_populated_places_simple.geojson";
const MONTHS = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((month, index) => [month, String(index + 1).padStart(2, "0")]),
);

const stripTags = (value) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&minus;/g, "-")
    .replace(/&#916;/g, "Delta")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const signedCoordinate = (degrees, direction) => {
  const value = Number(degrees);
  return direction === "S" || direction === "W" ? -value : value;
};

const durationSeconds = (value) => {
  const match = /^(\d{2})m(\d{2})s$/.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};

const typeName = (symbol) =>
  ({ P: "partial", A: "annular", T: "total", H: "hybrid" })[symbol[0]];

const pathCoordinates = (source, name) => {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(
    source,
  );
  if (!match) return [];
  return [
    ...match[1].matchAll(
      /lat:\s*(-?\d+(?:\.\d+)?),\s*lng:\s*(-?\d+(?:\.\d+)?)/g,
    ),
  ].map(([, latitude, longitude]) => [Number(longitude), Number(latitude)]);
};

const records = [];
const sourceHashes = {};
for (const source of SOURCES) {
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`NASA catalog request failed: ${response.status}`);
  const html = await response.text();
  sourceHashes[source] = createHash("sha256").update(html).digest("hex");
  for (const rawLine of html.split(/\r?\n/)) {
    if (!/5MCSEmap\/.+\/\d{4}-\d{2}-\d{2}\.gif/.test(rawLine)) continue;
    const text = stripTags(rawLine);
    const match =
      /^(\d+)\s+(\d{4})\s+([A-Z][a-z]{2})\s+(\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\d+\s+\d+\s+(\d+)\s+([PATH][a-z]?)\s+\S+\s+(-?\d+\.\d+)\s+(\d+\.\d+)\s+(\d+)([NS])\s+(\d+)([EW])\s+(\d+)\s*(\d+|-)?\s*(\d{2}m\d{2}s)?$/.exec(
        text,
      );
    if (!match) continue;
    const [
      ,
      catalogNumber,
      year,
      monthName,
      day,
      time,
      saros,
      typeSymbol,
      gamma,
      magnitude,
      lat,
      latDir,
      lon,
      lonDir,
      sunAltitude,
      pathWidth,
      duration,
    ] = match;
    const id = `${year}-${MONTHS.get(monthName)}-${day}`;
    if (id < START_ID || id > END_ID) continue;
    const centuryPath =
      Number(year) <= 2050
        ? "SEpath2001"
        : Number(year) <= 2100
          ? "SEpath2051"
          : Number(year) <= 2150
            ? "SEpath2101"
            : "SEpath2151";
    const central = typeSymbol[0] !== "P";
    records.push({
      id,
      peakUtc: `${id}T${time}Z`,
      type: typeName(typeSymbol),
      nasaType: typeSymbol,
      catalogNumber: Number(catalogNumber),
      saros: Number(saros),
      gamma: Number(gamma),
      magnitude: Number(magnitude),
      greatestPoint: {
        latitude: signedCoordinate(lat, latDir),
        longitude: signedCoordinate(lon, lonDir),
      },
      sunAltitudeDeg: Number(sunAltitude),
      pathWidthKm:
        pathWidth && pathWidth !== "-" ? Number(pathWidth) : undefined,
      maximumDurationSeconds: durationSeconds(duration),
      mapUrl: `https://eclipse.gsfc.nasa.gov/5MCSEmap/${Number(year) <= 2100 ? "2001-2100" : "2101-2200"}/${id}.gif`,
      pathUrl: central
        ? `https://eclipse.gsfc.nasa.gov/SEpath/${centuryPath}/SE${year}${monthName}${day}${typeSymbol[0]}path.html`
        : undefined,
    });
  }
}

records.sort((a, b) => a.id.localeCompare(b.id));
if (records[0]?.id !== START_ID || records.at(-1)?.id !== END_ID) {
  throw new Error(
    `Catalog range mismatch: ${records[0]?.id} to ${records.at(-1)?.id}`,
  );
}
if (new Set(records.map(({ id }) => id)).size !== records.length) {
  throw new Error("NASA catalog contains duplicate eclipse dates.");
}
const netherlandsFixture = records.find(({ id }) => id === END_ID);
if (
  !netherlandsFixture ||
  netherlandsFixture.type !== "total" ||
  Math.abs(netherlandsFixture.magnitude - 1.0603) > 0.0001
) {
  throw new Error("The 2135 Netherlands total-eclipse fixture changed.");
}

let generatedAt = new Date().toISOString();
try {
  const previous = JSON.parse(
    await readFile(
      new URL("../src/generated-eclipse-catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const unchanged = SOURCES.every(
    (url) =>
      previous.sources?.find((source) => source.url === url)?.sha256 ===
      sourceHashes[url],
  );
  if (unchanged && typeof previous.generatedAt === "string") {
    generatedAt = previous.generatedAt;
  }
} catch {
  // A first generation has no previous provenance manifest to preserve.
}

const output = {
  version: 1,
  generatedAt,
  range: { start: START_ID, end: END_ID },
  attribution: "Eclipse Predictions by Fred Espenak (NASA's GSFC)",
  sources: SOURCES.map((url) => ({ url, sha256: sourceHashes[url] })),
  tolerances: {
    eventMatchHours: 36,
    magnitude: 0.0001,
  },
  records,
};
await writeFile(
  new URL("../src/generated-eclipse-catalog.json", import.meta.url),
  `${JSON.stringify(output)}\n`,
);

const pathDirectory = new URL(
  "../src/generated-eclipse-paths/",
  import.meta.url,
);
await mkdir(pathDirectory, { recursive: true });
const centralRecords = records.filter(({ type }) => type !== "partial");
let generatedPathCount = 0;
for (let index = 0; index < centralRecords.length; index += 6) {
  const batch = centralRecords.slice(index, index + 6);
  await Promise.all(
    batch.map(async (record) => {
      const compactId = record.id.replaceAll("-", "");
      const sourceUrl = `https://eclipse.gsfc.nasa.gov/SEsearch/eclipse-path-data.js.php?Ecl=${compactId}&Spc=0.5`;
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(
          `NASA path request failed for ${record.id}: ${response.status}`,
        );
      }
      const source = await response.text();
      const north = pathCoordinates(source, "northernLimitCoords");
      const centerline = pathCoordinates(source, "centralLimitCoords");
      const south = pathCoordinates(source, "southernLimitCoords");
      if (!centerline.length || (!north.length && !south.length)) {
        throw new Error(`NASA path vectors missing for ${record.id}`);
      }
      const asset = {
        eventId: record.id,
        sourceUrl,
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        spacingDegrees: 0.5,
        north,
        centerline,
        south,
      };
      await writeFile(
        new URL(`${record.id}.json`, pathDirectory),
        `${JSON.stringify(asset)}\n`,
      );
      generatedPathCount += 1;
    }),
  );
}
const placesResponse = await fetch(PLACES_SOURCE);
if (!placesResponse.ok)
  throw new Error(`Natural Earth request failed: ${placesResponse.status}`);
const placesGeoJson = await placesResponse.json();
const places = placesGeoJson.features
  .map((feature) => ({
    label: [feature.properties.name, feature.properties.adm0name]
      .filter(Boolean)
      .join(", "),
    latitude: Number(
      feature.properties.latitude ?? feature.geometry.coordinates[1],
    ),
    longitude: Number(
      feature.properties.longitude ?? feature.geometry.coordinates[0],
    ),
    timezone: feature.properties.timezone || "UTC",
    population: Number(feature.properties.pop_max || 0),
  }))
  .filter(
    (place) =>
      place.label &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude),
  )
  .sort(
    (a, b) => b.population - a.population || a.label.localeCompare(b.label),
  );
await writeFile(
  new URL("../src/generated-place-catalog.json", import.meta.url),
  `${JSON.stringify(places)}\n`,
);
console.log(
  `Generated ${records.length} solar eclipses, ${generatedPathCount} central paths, and ${places.length} Natural Earth places.`,
);
