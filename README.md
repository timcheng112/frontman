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

## Repo checks

Run the full hardening pass locally:

```bash
npm run check
```

This runs:

- `npm run validate:digests`
- `npx tsc --noEmit`
- `npm run build`

## Digest generator MVP

Phase 3 adds a simple source-driven generator that fetches recent feed items and writes a Markdown digest into the Astro content collection.

### Files involved

- `scripts/sources.ts`
- `scripts/generate-digest.ts`
- `src/content/digests/`

### Generate a digest

```bash
npm run generate:digest
```

Useful flags:

```bash
npm run generate:digest -- --date 2026-05-21
npm run generate:digest -- --lookback-days 10
npm run generate:digest -- --force
```

What the generator does:

- Fetches a small set of RSS/news feeds defined in `scripts/sources.ts`
- Filters to recent items within the configured lookback window
- Groups links by source
- Writes a new Markdown file into `src/content/digests/`
- Refuses to create a second digest in the same ISO week unless `--force` is passed

### Verify the generated article

1. Run `npm run generate:digest`.
2. Run `npm run build` or `npm run dev`.
3. Confirm a new file exists in `src/content/digests/`.
4. Open the homepage and verify the new digest appears either as the latest issue or in the archive grid, depending on its `pubDate`.

## LLM ranking and writing

Phase 4 adds an OpenAI-backed generator that:

- fetches the same feed items as the MVP generator
- ranks the strongest stories with a structured editorial plan
- writes a fuller markdown article body
- saves the result into `src/content/digests/`

### Files involved

- `scripts/digest-core.ts`
- `scripts/generate-digest-llm.ts`
- `scripts/openai.ts`
- `prompts/frontman.md`

### Required environment variable

```bash
export OPENAI_API_KEY=your_api_key_here
```

Optional configuration:

```bash
export FRONTMAN_OPENAI_MODEL=gpt-5.4-mini
```

The Phase 4 generator defaults to `gpt-5.4-mini`.

### Generate an LLM-written digest

```bash
npm run generate:digest:llm
```

Useful flags:

```bash
npm run generate:digest:llm -- --date 2026-05-24
npm run generate:digest:llm -- --skip-if-exists
npm run generate:digest:llm -- --reasoning-effort low
npm run generate:digest:llm -- --max-items 5
npm run generate:digest:llm -- --model gpt-5.4-mini
npm run generate:digest:llm -- --force
```

What the LLM generator does:

- uses the Phase 3 source fetcher and duplicate-week protection
- sends the fetched items to the OpenAI Responses API for ranking
- asks the model to produce the final markdown body using the selected items only
- writes Astro-compatible frontmatter plus the generated article body
- supports `--skip-if-exists` for automation-safe reruns

### Verify the LLM article

1. Set `OPENAI_API_KEY`.
2. Run `npm run generate:digest:llm`.
3. Run `npm run build` or `npm run dev`.
4. Confirm a new file exists in `src/content/digests/`.
5. Open the homepage and verify the generated issue appears in the digest list.

## Weekly automation

Phase 5 adds scheduled GitHub Actions automation for digest generation.

### Files involved

- `.github/workflows/generate-digest.yml`
- `.github/workflows/deploy.yml`

### What the automation does

- runs every Monday at `01:00 UTC`
- supports manual runs through `workflow_dispatch`
- installs dependencies, generates the weekly LLM digest, and commits it back to `main`
- builds and deploys the updated Astro site in the same workflow after the digest commit is pushed
- no-ops cleanly if the same ISO week already has a digest file

### Required GitHub configuration

Repository secret:

- `OPENAI_API_KEY`

Optional repository variable:

- `FRONTMAN_OPENAI_MODEL`

The workflow defaults to `gpt-5.4-mini` if that variable is not set.

### Manual verification

1. Push the repo changes to GitHub.
2. Add the `OPENAI_API_KEY` repository secret.
3. Open `Actions` in GitHub.
4. Run `Generate Weekly Digest`.
5. Optionally provide a `date` input such as `2026-05-24` and set `force` only if you intentionally want to overwrite the duplicate-week safeguard.
6. Confirm the workflow commits a new digest file to `main`.
7. Confirm the `Generate Weekly Digest` workflow completes its build and deploy jobs and publishes the updated site.

## Telegram notification

Phase 6 adds a Telegram notification after a successful automated digest deploy.

### Files involved

- `scripts/send-telegram-notification.ts`
- `.github/workflows/generate-digest.yml`

### Required GitHub configuration

Repository secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

The notification step will skip cleanly if either secret is missing.

### What the notification does

- runs only after the weekly digest workflow generates a new digest and deploys the updated site
- reads the generated digest frontmatter
- builds a Telegram message with the digest title, publication date, description, and live URL
- sends the message with the Telegram Bot API using `sendMessage` and `parse_mode=HTML`

### Local verification

The helper script can be exercised locally without sending a real message by leaving the Telegram environment variables unset:

```bash
npm run notify:telegram
```

Expected output:

- It prints that Telegram notification is being skipped because the bot token or chat ID is not configured.

### GitHub verification

1. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to repository secrets.
2. Run `Generate Weekly Digest` from GitHub Actions with a test date if needed.
3. Confirm the workflow completes `generate`, `build`, `deploy`, and `notify`.
4. Confirm the target Telegram chat receives the digest notification with a working digest link.

## Polish and hardening

Phase 7 adds validation and CI guardrails around the content and automation pipeline.

### Files involved

- `scripts/validate-digests.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/generate-digest.yml`

### What the hardening layer does

- validates every digest file in `src/content/digests/`
- checks for required frontmatter fields
- enforces filename date and `pubDate` alignment
- prevents duplicate ISO-week digest files
- checks for the expected article intro heading
- runs CI on pushes and pull requests
- validates generated content during the scheduled digest workflow before commit and deploy

### How to verify

1. Run `npm run check`.
2. Confirm digest validation passes.
3. Confirm type-checking passes.
4. Confirm the Astro build passes.
5. Push a branch or open a pull request and confirm the `CI` workflow runs the same checks in GitHub Actions.

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
