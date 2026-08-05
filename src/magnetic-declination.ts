// World Magnetic Model 2025 coefficients and spherical-harmonic evaluation.
// NOAA/NCEI and the British Geological Survey; U.S. Government material is
// public domain. Model epoch 2025.0, valid through 2029-12-31.

const MAX_ORDER = 12;
const EPOCH = 2025;
const EARTH_REFERENCE_RADIUS_KM = 6371.2;
const WGS84_A_KM = 6378.137;
const WGS84_B_KM = 6356.7523142;

const RAW_COEFFICIENTS = `
1 0 -29351.8 0 12 0
1 1 -1410.8 4545.4 9.7 -21.5
2 0 -2556.6 0 -11.6 0
2 1 2951.1 -3133.6 -5.2 -27.7
2 2 1649.3 -815.1 -8 -12.1
3 0 1361 0 -1.3 0
3 1 -2404.1 -56.6 -4.2 4
3 2 1243.8 237.5 .4 -.3
3 3 453.6 -549.5 -15.6 -4.1
4 0 895 0 -1.6 0
4 1 799.5 278.6 -2.4 -1.1
4 2 55.7 -133.9 -6 4.1
4 3 -281.1 212 5.6 1.6
4 4 12.1 -375.6 -7 -4.4
5 0 -233.2 0 .6 0
5 1 368.9 45.4 1.4 -.5
5 2 187.2 220.2 0 2.2
5 3 -138.7 -122.9 .6 .4
5 4 -142 43 2.2 1.7
5 5 20.9 106.1 .9 1.9
6 0 64.4 0 -.2 0
6 1 63.8 -18.4 -.4 .3
6 2 76.9 16.8 .9 -1.6
6 3 -115.7 48.8 1.2 -.4
6 4 -40.9 -59.8 -.9 .9
6 5 14.9 10.9 .3 .7
6 6 -60.7 72.7 .9 .9
7 0 79.5 0 0 0
7 1 -77 -48.9 -.1 .6
7 2 -8.8 -14.4 -.1 .5
7 3 59.3 -1 .5 -.8
7 4 15.8 23.4 -.1 0
7 5 2.5 -7.4 -.8 -1
7 6 -11.1 -25.1 -.8 .6
7 7 14.2 -2.3 .8 -.2
8 0 23.2 0 -.1 0
8 1 10.8 7.1 .2 -.2
8 2 -17.5 -12.6 0 .5
8 3 2 11.4 .5 -.4
8 4 -21.7 -9.7 -.1 .4
8 5 16.9 12.7 .3 -.5
8 6 15 .7 .2 -.6
8 7 -16.8 -5.2 0 .3
8 8 .9 3.9 .2 .2
9 0 4.6 0 0 0
9 1 7.8 -24.8 -.1 -.3
9 2 3 12.2 .1 .3
9 3 -.2 8.3 .3 -.3
9 4 -2.5 -3.3 -.3 .3
9 5 -13.1 -5.2 0 .2
9 6 2.4 7.2 .3 -.1
9 7 8.6 -.6 -.1 -.2
9 8 -8.7 .8 .1 .4
9 9 -12.9 10 -.1 .1
10 0 -1.3 0 .1 0
10 1 -6.4 3.3 0 0
10 2 .2 0 .1 0
10 3 2 2.4 .1 -.2
10 4 -1 5.3 0 .1
10 5 -.6 -9.1 -.3 -.1
10 6 -.9 .4 0 .1
10 7 1.5 -4.2 -.1 0
10 8 .9 -3.8 -.1 -.1
10 9 -2.7 .9 0 .2
10 10 -3.9 -9.1 0 0
11 0 2.9 0 0 0
11 1 -1.5 0 0 0
11 2 -2.5 2.9 0 .1
11 3 2.4 -.6 0 0
11 4 -.6 .2 0 .1
11 5 -.1 .5 -.1 0
11 6 -.6 -.3 0 0
11 7 -.1 -1.2 0 .1
11 8 1.1 -1.7 -.1 0
11 9 -1 -2.9 -.1 0
11 10 -.2 -1.8 -.1 0
11 11 2.6 -2.3 -.1 0
12 0 -2 0 0 0
12 1 -.2 -1.3 0 0
12 2 .3 .7 0 0
12 3 1.2 1 0 -.1
12 4 -1.3 -1.4 0 .1
12 5 .6 0 0 0
12 6 .6 .6 .1 0
12 7 .5 -.1 0 0
12 8 -.1 .8 0 0
12 9 -.4 .1 0 0
12 10 -.2 -1 -.1 0
12 11 -1.3 .1 0 0
12 12 -.7 .2 -.1 -.1`;

function matrix() {
  return Array.from({ length: MAX_ORDER + 1 }, () =>
    Array(MAX_ORDER + 1).fill(0),
  );
}

function decimalYear(date: Date) {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

const model = (() => {
  const c = matrix();
  const cd = matrix();
  const snorm = matrix();
  const k = matrix();
  for (const line of RAW_COEFFICIENTS.trim().split("\n")) {
    const [n, m, g, h, dg, dh] = line.trim().split(/\s+/).map(Number);
    c[m][n] = g;
    cd[m][n] = dg;
    if (m !== 0) {
      c[n][m - 1] = h;
      cd[n][m - 1] = dh;
    }
  }

  snorm[0][0] = 1;
  for (let n = 1; n <= MAX_ORDER; n += 1) {
    snorm[0][n] = (snorm[0][n - 1] * (2 * n - 1)) / n;
    let j = 2;
    for (let m = 0; m <= n; m += 1) {
      k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const factor = ((n - m + 1) * j) / (n + m);
        snorm[m][n] = snorm[m - 1][n] * Math.sqrt(factor);
        j = 1;
        c[n][m - 1] *= snorm[m][n];
        cd[n][m - 1] *= snorm[m][n];
      }
      c[m][n] *= snorm[m][n];
      cd[m][n] *= snorm[m][n];
    }
  }
  return { c, cd, k };
})();

export function magneticDeclination(
  latitudeDeg: number,
  longitudeDeg: number,
  elevationMeters: number,
  date: Date,
) {
  const altitudeKm = elevationMeters / 1000;
  const latitude = (latitudeDeg * Math.PI) / 180;
  const longitude = (longitudeDeg * Math.PI) / 180;
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLat2 = sinLat * sinLat;
  const cosLat2 = cosLat * cosLat;
  const a2 = WGS84_A_KM * WGS84_A_KM;
  const b2 = WGS84_B_KM * WGS84_B_KM;
  const c2 = a2 - b2;
  const a4 = a2 * a2;
  const b4 = b2 * b2;
  const c4 = a4 - b4;
  const q = Math.sqrt(a2 - c2 * sinLat2);
  const q1 = altitudeKm * q;
  const q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = sinLat / Math.sqrt(q2 * cosLat2 + sinLat2);
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const r2 = altitudeKm * altitudeKm + 2 * q1 + (a4 - c4 * sinLat2) / (q * q);
  const r = Math.sqrt(r2);
  const d = Math.sqrt(a2 * cosLat2 + b2 * sinLat2);
  const ca = (altitudeKm + d) / r;
  const sa = (c2 * cosLat * sinLat) / (r * d);

  const sp = Array(MAX_ORDER + 1).fill(0);
  const cp = Array(MAX_ORDER + 1).fill(0);
  cp[0] = 1;
  sp[1] = Math.sin(longitude);
  cp[1] = Math.cos(longitude);
  for (let m = 2; m <= MAX_ORDER; m += 1) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }

  const p = matrix();
  const dp = matrix();
  const pp = Array(MAX_ORDER + 1).fill(0);
  p[0][0] = 1;
  pp[0] = 1;
  const yearOffset = decimalYear(date) - EPOCH;
  const aor = EARTH_REFERENCE_RADIUS_KM / r;
  let ar = aor * aor;
  let br = 0;
  let bt = 0;
  let bp = 0;
  let bpp = 0;

  for (let n = 1; n <= MAX_ORDER; n += 1) {
    ar *= aor;
    for (let m = 0; m <= n; m += 1) {
      if (n === m) {
        p[m][n] = st * p[m - 1][n - 1];
        dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
      } else if (n === 1 && m === 0) {
        p[m][n] = ct * p[m][n - 1];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
      } else if (n > 1) {
        p[m][n] = ct * p[m][n - 1] - model.k[m][n] * p[m][n - 2];
        dp[m][n] =
          ct * dp[m][n - 1] - st * p[m][n - 1] - model.k[m][n] * dp[m][n - 2];
      }

      const g = model.c[m][n] + yearOffset * model.cd[m][n];
      const h =
        m === 0 ? 0 : model.c[n][m - 1] + yearOffset * model.cd[n][m - 1];
      const temp1 = g * cp[m] + h * sp[m];
      const temp2 = g * sp[m] - h * cp[m];
      const par = ar * p[m][n];
      bt -= ar * temp1 * dp[m][n];
      bp += m * temp2 * par;
      br += (n + 1) * temp1 * par;

      if (st === 0 && m === 1) {
        if (n === 1) pp[n] = pp[n - 1];
        else pp[n] = ct * pp[n - 1] - model.k[m][n] * pp[n - 2];
        bpp += m * temp2 * ar * pp[n];
      }
    }
  }

  bp = st === 0 ? bpp : bp / st;
  const north = -bt * ca - br * sa;
  const east = bp;
  return (Math.atan2(east, north) * 180) / Math.PI;
}
