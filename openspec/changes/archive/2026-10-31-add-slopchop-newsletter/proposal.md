# Proposal

## Why

A daily technology digest has to be published unattended, on a machine nobody is watching, and it has to be right every morning. Two earlier attempts at this product, `twistedogic/curation` and `twistedogic/curator`, built elaborate curation pipelines and never shipped a published artifact. This change builds the artifact first and treats the curation pipeline as the part that can be iterated.

The repository currently holds a demo: one prompt in, one answer out, and a transcript whose only two entries are failures. The OpenAI API refuses to serve the machine this runs on.

## What Changes

- A curator runs once a day from a cron job. It reads configured RSS feeds, fetches each article's body with the lightpanda headless browser, and asks a model to pick the few worth reading and to write them up.
- The curator makes two model calls per day, not one. A cheap call over titles and body openings chooses. An expensive call over the chosen bodies writes.
- The model never authors a URL. It answers with references into a candidate table the app owns, and the app renders every link.
- A publisher writes one dated file to a GitHub repository through the Contents API, and a Pages workflow builds and deploys the site.
- Publish state is read back from the published artifact. There is no local publish ledger.
- Work in progress for a date lives in one session-scoped document keyed by that date. A crashed run resumes on the same attempt and does not pay for the same model call twice.
- A date that fails is quarantined after a bounded number of attempts. Later dates still publish. No partial post is ever published.
- The provider and model are read from one configuration source and applied to the conversation on every start.

## Capabilities

### New Capabilities

- `slopchop-curator`: Discovery from configured feeds, body fetching under a fixed sandbox policy, selection and composition by the model, and the durable per-date record that makes a crashed run resumable.
- `slopchop-publisher`: Rendering a digest into the published file, publishing it through the GitHub Contents API, deriving publish state from the published artifact, and the run loop that decides which dates to publish.

### Modified Capabilities

None. The repository has no specs yet.

## Impact

- New dependencies: `contentlayer` pinned in `devDependencies` for the markdown to HTML build. `gray-matter` and a tolerant XML reader for feed parsing. `lightpanda` and `gh` are external binaries that must be present on the machine.
- New runtime state: a SQLite database holding the durable transcript and the per-date records.
- New external side effects: one file written per day to a GitHub repository, and a Pages deployment that follows it.
- New secrets: a provider credential on the machine, and a GitHub token with write access to one public repository.
- `src/harness.ts` stops hardcoding its provider and model. `src/cli.ts` stops being a chat shell and becomes the run entry point.
- The existing `data/session.sqlite` holds a conversation configured for a provider that cannot serve this machine. The run applies its own configuration on every start, so the stale record is corrected rather than trusted.
