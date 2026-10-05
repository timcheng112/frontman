<img src="./public/images/frontman-logo.png" alt="Frontman reading a newspaper about frontend and AI news" width="144" />

# Heya, I'm Frontman! 👋

Your weekly frontend and AI reading companion.

Tim built me for his own learning: a way to keep up with what's happening in frontend and AI, discover useful ideas, and find things worth trying.
Each week, I trawl a curated set of feeds and turn the interesting finds into a digest of what changed and why it matters.

**[Read the weekly digest →](https://timcheng112.github.io/frontman/)**

## A little about the writer 🎨

I'm the site's editorial character, with AI generating the digest in my voice.
I'm curious, a little playful, and very easy to distract with clever CSS, expressive interfaces, clean architecture, or a good performance win.
I like AI tools that help us build better software, and I think understanding the fundamentals is a big part of making them useful.

My guiding thought: **Good code + AI = unstoppable.**

Think of me as a fellow builder sharing what caught my attention and learning alongside you.
My personality and editorial priorities live in the [style guide](docs/frontman-editorial-style.md), with the writing instructions in the [generator prompt](prompts/frontman.md).

## What's in the digest? 🗞️

- Frontend platform updates, React patterns, CSS, and UI engineering.
- Performance, architecture, design systems, and developer tooling.
- AI tools and coding workflows with practical uses for engineers.
- Story summaries, links to the original sources, and tips worth trying.

The site has a latest-issue highlight, an archive of previous editions, and individual reading pages.
The digest is AI-written from the fetched feed items; the source links are there for further reading and checking the details.

## How an edition comes together

1. **Gather:** fetch recent RSS and Atom entries from the [configured sources](scripts/sources.ts), including web.dev, MDN, the React blog, GitHub, and OpenAI.
2. **Filter:** keep items within the lookback window and deduplicate overlapping stories across sources.
3. **Write:** use the OpenAI Responses API to rank stories and write an issue in Frontman's voice.
4. **Publish:** validate the Markdown, commit it to the repository, build the Astro site, and deploy to GitHub Pages.
5. **Notify:** optionally send a Telegram notification after a new issue is deployed.

The weekly workflow is scheduled for **Mondays at 01:00 UTC / 09:00 Singapore time** and can also be run manually.
It skips generation when that ISO week already has an issue.

## Built with

**Astro · TypeScript · Node.js · Markdown · OpenAI API · GitHub Actions · GitHub Pages**

## Run it locally

Use Node.js 22.7 or later; the repository pins `22.7.0` in [.tool-versions](.tool-versions).

```bash
npm ci
npm run dev
```

Open the URL printed by Astro, usually `http://localhost:4321/`.
The existing digest archive can be browsed locally without an API key.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run check` | Validate digest content, type-check scripts, and build the site |
| `npm run build` | Write the production site to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run generate:digest` | Generate a source-grouped digest without AI |
| `npm run generate:digest:llm` | Rank stories and generate an AI-written digest |

<details>
<summary><strong>Generate an issue and configure weekly publishing</strong></summary>

### Generate an issue

For an AI-written digest, set `OPENAI_API_KEY` in your shell, then run:

```bash
npm run generate:digest:llm
```

The local generator uses `FRONTMAN_OPENAI_MODEL` when set, otherwise `gpt-5.4-mini`.
You can also choose a model with `--model`.

For a simpler digest that groups fetched entries by source and needs no API key:

```bash
npm run generate:digest
```

Both generators write Markdown to `src/content/digests/`.
After generating an issue, run `npm run check` and open it locally to review the result.

| Option | Purpose |
| --- | --- |
| `--date YYYY-MM-DD` | Set the issue date; defaults to today |
| `--lookback-days 10` | Adjust the source lookback window; defaults to 7 days |
| `--skip-if-exists` | Exit successfully if that ISO week already has an issue |
| `--force` | Bypass the existing-week guard for an intentional regeneration |
| `--model MODEL` | Choose the model for the AI generator |
| `--reasoning-effort low` | Set reasoning effort for the AI generator; defaults to `low` |
| `--max-items 5` | Limit the AI generator's selected stories; defaults to 5, with a minimum of 3 |

Pass options after `--`, for example:

```bash
npm run generate:digest:llm -- --lookback-days 10 --max-items 5 --skip-if-exists
```

Keep one issue per ISO week.
Content validation still rejects duplicate weeks if `--force` creates an additional issue.

### Weekly automation

The [Generate Weekly Digest workflow](.github/workflows/generate-digest.yml) generates, validates, commits, builds, and deploys new issues.
It also supports **Actions → Generate Weekly Digest → Run workflow** for a manual run.

Add `OPENAI_API_KEY` as a repository secret to enable AI generation.
The workflow passes a `--model` argument, currently defaulting to `gpt-5.4-mini`; use the manual run's `model` input to override it, or update the workflow default for scheduled runs.
That explicit argument takes precedence over `FRONTMAN_OPENAI_MODEL`.

Optional repository secrets enable Telegram notifications:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Notifications include the issue title, date, description, and live link.
The notification step is skipped if either secret is missing.
The local helper, `npm run notify:telegram`, also skips when those credentials are absent; sending a notification additionally requires `FRONTMAN_DIGEST_PATH` and `FRONTMAN_DIGEST_URL`.

### GitHub Pages

Under **Settings → Pages → Build and deployment**, select **GitHub Actions**.
The [deployment workflow](.github/workflows/deploy.yml) publishes pushes to `main`, and the weekly generation workflow deploys its own new issue after committing it.

The [Astro configuration](astro.config.mjs) derives the site URL and base path from the repository in GitHub Actions.
For this repository, the public URL is **https://timcheng112.github.io/frontman/**.
Standard GitHub Pages project sites need no additional URL variables.

For a custom domain, add `public/CNAME` and set the repository variable `SITE_URL` to the full site URL.
Use `BASE_PATH` only when a specific subpath is needed.

### Checks

`npm run check` validates frontmatter, publication dates, duplicate weeks, and article structure, then runs TypeScript checking and a production build.
The [CI workflow](.github/workflows/ci.yml) runs the same checks on pushes to `main` and pull requests.
The build clears `.astro/` and `dist/` first so removed issues do not leave stale pages behind.

</details>

## Around the repository

| Path | What's inside |
| --- | --- |
| `src/pages/`, `src/components/`, `src/layouts/` | Astro pages, UI components, and reading layouts |
| `src/content/digests/` | Published Markdown issues |
| `scripts/` | Feed collection, generation, validation, and notification scripts |
| `prompts/frontman.md` | The operational prompt used to rank and write issues |
| `docs/frontman-editorial-style.md` | Frontman's personality, beliefs, and editorial priorities |
| `public/images/` | Character illustrations and branding |
| `.github/workflows/` | Weekly generation, CI, and GitHub Pages deployment |
