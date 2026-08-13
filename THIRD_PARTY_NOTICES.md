# Third-party data and software

- Eclipse catalog: “Eclipse Predictions by Fred Espenak, NASA’s GSFC,” from the [NASA GSFC 2001–2100](https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html) and [2101–2200](https://eclipse.gsfc.nasa.gov/SEcat5/SE2101-2200.html) catalogs.
- Detailed 2026 path coordinates: [NASA GSFC 2026 path table](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2026Aug12Tpath.html).
- Land geometry: [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) 1:110m land data, distributed via `world-atlas` 2.0.2. Natural Earth data is public domain.
- Astronomical calculations: [Astronomy Engine](https://github.com/cosinekitty/astronomy), MIT license.
- Bright-star names and J2000 positions: selected records from the [Yale Bright Star Catalogue, 5th Revised Edition](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50), distributed by the Strasbourg astronomical Data Center and included here with attribution.
- Magnetic declination: degree/order 12 coefficients from the [World Magnetic Model 2025](https://www.ncei.noaa.gov/products/world-magnetic-model), produced by NOAA/NCEI and the British Geological Survey. The WMM source and coefficients are U.S. Government material in the public domain; this application includes an independent TypeScript evaluation of those coefficients for offline true-north correction.
- Space Grotesk: bundled through Fontsource under the SIL Open Font License 1.1. The full license is included with the installed `@fontsource-variable/space-grotesk` package.
- Leaflet: interactive mapping library under the BSD 2-Clause license.
- CARTO Dark Matter: optional map tiles with OpenStreetMap contributors; loaded only after explicit user opt-in.
- Esri World Hillshade: optional terrain-relief tiles; loaded only after the user enables hillshade.
- `tz-lookup`: offline coordinate-to-IANA-timezone lookup under the MIT license.
