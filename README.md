# Frontman

Frontman is a lightweight Astro blog for a weekly frontend and AI engineering digest.

## Current scope

The current implementation includes:

- Astro static pages and content collections
- A designed homepage with hero, latest digest highlight, archive grid, and footer
- A designed article page with a sticky reading header and collapsed article title row
- Local image assets in `public/images/`
- One sample digest entry in `src/content/digests/`

## Local development

```bash
npm install
npm run dev
```

Open the local URL printed by Astro, usually `http://localhost:4321/`.

Sample routes:

- `http://localhost:4321/digests/2026-05-25-frontend-ai-digest/`

## Production build

```bash
npm run build
```

The generated static site will be written to `dist/`.

## GitHub Pages deployment

This project is configured to deploy with GitHub Pages using GitHub Actions.

### Files involved

- `astro.config.mjs`
- `.github/workflows/deploy.yml`

### Repo settings

1. Push the repository to GitHub.
2. In GitHub, open `Settings` → `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Make sure your default deployment branch matches the workflow trigger, currently `main`.

### URL configuration

Project site:
- If the repository is something like `https://github.com/<username>/frontman`, the workflow build will automatically deploy the site to `https://<username>.github.io/frontman/`.
- In that case, Astro will automatically set `base` to `/<repo-name>` during the GitHub Actions build.

User or organization root site:
- If the repository name is exactly `<username>.github.io`, Astro will deploy at `https://<username>.github.io/`.
- In that case, no `base` path is used.

Custom domain later:
- Add `public/CNAME` with your domain.
- Set the repository variable `SITE_URL` to your full site URL, for example `https://frontman.example.com`.
- Leave `BASE_PATH` empty unless you intentionally want to deploy under a subpath.

Optional repository variables:
- `SITE_URL`
- `BASE_PATH`

By default, you do not need either variable for a standard GitHub Pages project site.

## Project structure

- `src/pages/` Astro routes
- `src/components/` reusable Astro UI components
- `src/layouts/` shared page layouts
- `src/content/digests/` Markdown digest entries
- `public/images/` Frontman image assets
