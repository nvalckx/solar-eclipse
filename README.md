# Eclipse/26

A private, interactive preview of the total solar eclipse on August 12, 2026. Choose a location, move through the local eclipse, and switch between a horizon-aware sky and a scientifically consistent magnified close-up.

## Why it stays lightweight

- React, Astronomy Engine, and a small amount of canvas/SVG code run entirely in the browser.
- No backend, analytics, geocoder, map tiles, API keys, or runtime third-party requests.
- The verified eclipse path and simplified Natural Earth land geometry are bundled with the app.
- The production build enforces a 180 KiB gzip JavaScript/CSS budget and a 250 KiB budget including the self-hosted font.

Location is saved only in browser storage. Browser geolocation is requested only after the visitor presses a location action. The phone sky guide requests camera and motion access only after **Start alignment** is pressed; sensor and camera data stay on the device. Camera alignment is planning guidance, not eye protection: camera optics require an appropriate front-mounted solar filter during bright partial phases. Terrain, weather, atmospheric transparency, and detailed lunar-limb effects are not modeled.

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

If the Natural Earth dependency is deliberately updated, regenerate the committed SVG path with:

```bash
node scripts/generate-map-data.mjs
```

## Scientific sources

- Local Sun/Moon positions and eclipse circumstances: [Astronomy Engine](https://github.com/cosinekitty/astronomy).
- Totality limits, centerline, and timing: [Eclipse Predictions by Fred Espenak, NASA’s GSFC](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html).
- Land geometry: [Natural Earth 1:110m](https://www.naturalearthdata.com/downloads/110m-physical-vectors/) via `world-atlas`.
- Magnetic-to-true-north correction: [NOAA/BGS World Magnetic Model 2025](https://www.ncei.noaa.gov/products/world-magnetic-model).
- Eye safety: [NASA eclipse safety guidance](https://science.nasa.gov/eclipses/safety/).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and licensing details and [RELEASING.md](RELEASING.md) for GitHub Pages deployment.
