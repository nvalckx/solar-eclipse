# Releasing Eclipse/26 on GitHub Pages

The site deploys as a static Vite artifact. A push to `main` must pass formatting, linting, unit tests, the production build and bundle budget, and Chromium/Firefox/WebKit browser tests before the exact tested `dist/` directory is published.

## First release

1. Install and verify locally:

   ```bash
   pnpm install --frozen-lockfile
   pnpm exec playwright install chromium firefox webkit
   pnpm run verify
   ```

2. Initialize Git if needed, create an empty GitHub repository, and push `main`:

   ```bash
   git init
   git branch -M main
   git add .
   git commit -m "Prepare Eclipse/26 for GitHub Pages"
   git remote add origin https://github.com/<user>/<repository>.git
   git push -u origin main
   ```

3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. Wait for **Verify and deploy to GitHub Pages** to pass, then open the URL in its deployment summary.

Pull requests run the same verification in `.github/workflows/verify.yml`. Failed browser runs retain a Playwright report for seven days.

## Release acceptance checklist

- `pnpm install --frozen-lockfile` succeeds on Node 24.
- `pnpm run verify` is green.
- The bundle budget line remains below both thresholds.
- The Pages URL loads from `https://<user>.github.io/<repository>/` with no failed or cross-origin runtime requests.
- Sky and Close-up show a fully covered photosphere during totality.
- Location, timeline, dialogs, and sharing work with keyboard and touch.
- Layout has no horizontal overflow at 320, 390, 768, and 1440 CSS pixels.

The app intentionally has no service worker. New fingerprinted assets become active on refresh without an additional cache lifecycle.
