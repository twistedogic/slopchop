# slopchop

A daily technology digest. It reads a few RSS feeds, asks a model which of the
articles are worth reading, writes them up, and publishes one dated post a day
to <https://twistedogic.github.io/slopchop/>.

The run is unattended: it holds a lock, it records what it decided, it resumes
where it crashed, and it fails loudly with a named cause rather than quietly
publishing nothing.

## Requirements

- Node >= 22.18 — it runs the TypeScript directly, so there is no build step.
- `lightpanda` on the PATH — the headless browser that fetches article bodies.
- A credential for the model provider and a GitHub token with write access to
  the published repository.

## Setup

```bash
npm install
cp .env.example .env      # add the credentials, see below
```

### The one-time credential step

The provider credential and the GitHub token are both read from the environment
(or from the credential store the run points at).

```bash
# the provider key: the run reads MINIMAX_API_KEY, or the store at
# SLOPCHOP_CREDENTIALS, which is pi's own file: ~/.pi/agent/auth.json
echo "MINIMAX_API_KEY=..." >> .env

# the GitHub token: `repo` scope is enough, it writes one file a day
gh auth token >> .env
```

`node scripts/provider-probe.ts` prints which providers can be used from this
machine, and what one completion costs.

## Run

```bash
npm start        # curate and publish today's catch up
```

The run publishes one post for every date inside the coverage window that the
feeds cover, that is not published yet, and that is not today. It is meant to
run from a cron job:

```cron
17 6 * * *  cd /home/pi/slopchop && npm start >> /var/log/slopchop.log 2>&1
```

## Check

```bash
npm test          # the whole suite: no network, no provider credential
npm run typecheck
npm run build     # builds dist/ from content/, exactly as Pages does
npm run prove     # build, then the suite
```

## The site

`content/<date>.md` is the published post: frontmatter the application wrote,
and one section per article. The build turns it into `dist/<date>/index.html`
and an archive that lists the posts newest first. The Pages workflow
(`.github/workflows/pages.yml`) runs that build on `main` and deploys it, so
the publisher, the state query and the build all name one branch.

## The run report

Every run prints one line per date, and keeps the same report in the database:

```
2026-10-27 published
2026-10-28 skipped: nothing was worth reading
2026-10-29 failed: incomplete_answer: the answer carried 1 of 2 sections
```

`published`, `skipped` and `failed` are the three outcomes. A date that failed
three times is abandoned and reported as such; the run carries on with the
other dates. The exit code is non-zero when a date failed, so a cron job sees
it.

A gap in the archive is explained by the report: the run that skipped a date
says why, and the report survives a restart.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SLOPCHOP_PROVIDER` | `minimax` | The model provider |
| `SLOPCHOP_MODEL` | `MiniMax-M3` | The model id |
| `SLOPCHOP_CREDENTIALS` | `~/.pi/agent/auth.json` | The credential store the provider reads |
| `SLOPCHOP_REPO` | `twistedogic/slopchop` | The published repository |
| `SLOPCHOP_BRANCH` | `main` | The branch the publisher writes and the build reads |
| `SLOPCHOP_CONTENT_DIR` | `content` | The directory the posts live in, inside the repository |
| `GITHUB_TOKEN` | — | The token that writes the post |
| `SLOPCHOP_TZ` | `Asia/Hong_Kong` | The timezone a date belongs to |
| `SLOPCHOP_COVERAGE_DAYS` | `3` | How many days back the run looks |
| `SLOPCHOP_MAX_ATTEMPTS` | `3` | How many attempts a date may cost |
| `SLOPCHOP_FEEDS` | three feeds | Comma separated feed urls |
| `SLOPCHOP_DB` | `data/session.sqlite` | The SQLite file holding the transcript and the records |
| `SLOPCHOP_BROWSER` | `lightpanda` | The headless browser binary |
| `SLOPCHOP_FETCH_TIMEOUT_MS` | `20000` | The hard deadline of one body fetch |
| `SLOPCHOP_FETCH_MAX_BYTES` | `200000` | The output cap of one body fetch |
| `SLOPCHOP_FETCH_CONCURRENCY` | `4` | How many body fetches run at once |
| `SLOPCHOP_EXCERPT_CHARS` | `1200` | How much of a body the selection call sees |

## Layout

| File | What it does |
| --- | --- |
| `src/cli.ts` | The run entry point |
| `src/run.ts` | The run policy: the dates, the attempt budget, the report |
| `src/curate.ts` | One day: fetch, select, compose, record |
| `src/model.ts` | The two model calls, their request ids and the tolerant parser |
| `src/feeds.ts` | The feed adapter and the tolerant RSS and Atom reader |
| `src/fetch.ts` | The body fetch adapter and the browser's command line |
| `src/render.ts` | The renderer: the frontmatter, the links, the escaped prose |
| `src/publisher.ts` | The Contents API publish and the publish state |
| `src/records.ts` | The durable per-date record and the run report |
| `src/lock.ts` | The run lock |
| `src/harness.ts` | The durable session and the model configuration |
| `site/build.ts` | The build: `content/` to `dist/` |
| `site/template.html` | The one template every page uses |
