# Eclipse Companion 2026–2135

A private, location-aware companion for every solar eclipse from August 12, 2026 through October 7, 2135—the next total eclipse crossing the Netherlands. Search the catalog, choose an observing location, inspect exact local circumstances, and move through each visible event in a horizon-aware sky or scientifically consistent magnified close-up.

## Why it stays lightweight

- React, Astronomy Engine, and a small amount of canvas/SVG code run entirely in the browser.
- No backend, accounts, analytics, geocoder API, or API keys.
- A bundled Natural Earth overview and local eclipse calculations work immediately without network requests.
- Detailed CARTO mapping and optional Esri hillshade load only after explicit consent; the selected location and calculations survive tile failures.
- The production build enforces a 180 KiB gzip JavaScript/CSS budget and a 250 KiB budget including the self-hosted font.

Location and eclipse-alert preferences are saved only in browser storage. Browser geolocation is requested only after the visitor presses a location action, and notification permission is requested only after **Enable browser alerts** is pressed. Browser alerts run while the page remains open; the optional calendar export includes the same locally calculated contact times for background reminders. The all-sphere sky guide includes an always-available live clock with current Sun and Moon positions, daily trajectories, a fast-forward slider, and a local contact countdown. It is usable without permissions; motion and camera access are requested independently only after **Use phone compass** or **Camera AR** is pressed, and their data stays on the device. Camera alignment is planning guidance, not eye protection: camera optics require an appropriate front-mounted solar filter during bright partial phases. Terrain, weather, atmospheric transparency, and detailed lunar-limb effects are not modeled.

## Develop and verify

Requirements: Node.js 22.12 or newer and pnpm 11.9.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
pnpm run dev
```

Run the complete release gate:

```bash
pnpm run verify
```

Individual commands are available for `lint`, `format:check`, `test`, `build`, and `test:e2e`. Browser tests serve the built site at a repository-style `/eclipse-26/` path to exercise GitHub Pages asset resolution.

Regenerate the committed NASA eclipse catalog and Natural Earth place index only when intentionally updating their source data:

```bash
pnpm run generate:eclipse-data
```

If the Natural Earth map dependency is deliberately updated, regenerate the committed SVG land path with:

```bash
node scripts/generate-map-data.mjs
```

## Scientific sources

- Local Sun/Moon positions and eclipse circumstances: [Astronomy Engine](https://github.com/cosinekitty/astronomy).
- Century catalog, greatest-eclipse coordinates, and central-event data: [NASA GSFC 2001–2100](https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html) and [2101–2200](https://eclipse.gsfc.nasa.gov/SEcat5/SE2101-2200.html).
- Detailed verified path and timing data for the 2026 event: [Eclipse Predictions by Fred Espenak, NASA GSFC](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html).
- Land geometry: [Natural Earth 1:110m](https://www.naturalearthdata.com/downloads/110m-physical-vectors/) via `world-atlas`.
- Magnetic-to-true-north correction: [NOAA/BGS World Magnetic Model 2025](https://www.ncei.noaa.gov/products/world-magnetic-model).
- Eye safety: [NASA eclipse safety guidance](https://science.nasa.gov/eclipses/safety/).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and licensing details and [RELEASING.md](RELEASING.md) for GitHub Pages deployment.
