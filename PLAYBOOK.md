# slopchop playbook

The execution plan for turning the reviewed design into a working daily digest.
It exists because the design has thirteen known holes and two prior attempts at
this same product died without ever publishing an artifact.

## The predicate

The run is done when this is true, checked on the real product and not a proxy.

> On a clean machine holding the repo, the pinned toolchain and a seeded
> credential store, `npm run curate` with no arguments
>
> **(a)** publishes a post at `https://twistedogic.github.io/slopchop/<YYYY-MM-DD>`
> for every date the feeds carry news for, whose served HTML contains the post
> body, carries no `javascript:` or `data:` URL, and carries no unescaped title
> in the markup; and
>
> **(b)** for every date it could not publish, reports one line naming the
> stage, the URL and the underlying cause, publishes no partial post and no
> partial file, and lets the other dates publish; and
>
> **(c)** exits non-zero when any date failed.
>
> A second invocation on the same date publishes nothing and spends nothing.

A failed date must not cost the reader the other dates. That is why the
predicate is per date rather than all or nothing.

Everything below is in service of that sentence. A unit that does not move it
closer is not a unit.

## Scope

| | |
| --- | --- |
| Starting point | 54 lines of source, all of it a demo. One SQLite file with two failed turns in it. |
| Deliverable | One repo that publishes one dated post a day, unattended, on a Raspberry Pi. |
| Units | 14 implementation units plus 4 spikes. |
| External unknowns | 4 (GitHub Pages chain, OAuth from Hong Kong, lightpanda on aarch64, contentlayer sanitizing). |
| Estimated agent time | 8 to 12 hours, plus one Pi provisioning session. |

## Rigor

High on the publish and verify spine. Medium on the curator logic.

The spine earns high rigor because it is a one-way door. The repo topology, the
Pages source mode, the branch name, the provider and the state model are all
cheap to change today and expensive to change after a curator is built on top of
them. Each one is settled by a spike with a binary verdict, not by an opinion.

The curator logic earns medium rigor because it is fully reversible. The
selection prompt, the template and the ranking heuristic can all be rewritten
in an afternoon, and the predicate script tells us whether the rewrite helped.

Blast radius stays low. One reader, one blog, no user data, no money at scale,
no compliance surface. That is why there is no multi-tenant design, no auth
system, and no HA story anywhere in this document.

The failure path earns high rigor regardless, because the run is unattended. A
failure discovered at 4am with nobody watching is the difference between a
newsletter and a dead feed, so "fail loud" gets gates rather than good
intentions.

## Blockers carried into the run

- Thirty-three findings from two adversarial reviews of the design. Thirteen
  survived as requirements or explicit dismissals. Every one of the thirty-three
  has a recorded disposition in
  `openspec/changes/add-slopchop-newsletter/review-findings.md`. None becomes a
  footnote.
- `twistedogic/slopchop` does not exist. Confirmed 404.
- The OpenAI API refuses to serve Hong Kong. The chosen provider is untested.
- Catch-up cannot be built from the chosen sources. They are current-state only.
  A catch-up post would be wrong-dated. This invalidates a decision made during
  the design session and the design gets corrected before any code lands.
- `twistedogic/curation` is prior art in the same domain, in Zig, with three
  documented defects and one change never archived. It is a reference for feed
  parsing and a warning about what happens when the artifact is deferred.

## Phase list

This is the list a reviewer reads. The authoritative unit detail lives in
`openspec/changes/add-slopchop-newsletter/tasks.md`.

| Wave | What | Units | Gate |
| --- | --- | --- | --- |
| 0 | Spikes. Settle the four external unknowns before anything depends on them. | 4, parallel | Each spike has a binary verdict and a log row. |
| 1 | Design revision. Fold the spike verdicts and the thirteen findings into an OpenSpec change. | 1 | `openspec validate` passes and every finding is encoded or dismissed with a reason. |
| 2 | The spine. Repo, Pages, build, publish. | 3 | The live URL serves a hand-written post with working styles. |
| 3 | The curator core. Types, agent core, sources, fetch, state, selection, sanitizing. | 6 | `npm test` green against fixtures, no network and no money. |
| 4 | Orchestration. The run loop and the Pi. | 2 | `npm run prove` passes on the Pi against the predicate. |
| 5 | Hand back. README, decision trail, independent trail review. | 2 | The predicate holds on two consecutive runs and the trail is committed. |

Wave 0 fans out. The other waves do not, and the reason is in the fan-out
section below.

### Wave 0, the four spikes

| Spike | Question | Binary verdict |
| --- | --- | --- |
| SP1 | Does a commit to `content/` become a served page at `/slopchop/<slug>`? | The URL returns 200 with the body and the stylesheet. |
| SP2 | Can `openai-codex` authenticate from Hong Kong and return `stopReason: "stop"`? | One call completes with the expected stop reason. |
| SP3 | Does lightpanda run on the Pi with the blocking and deadline flags? | One real article returns markdown on aarch64. |
| SP4 | Does contentlayer plus a scheme allowlist keep `javascript:` and `data:` out of the HTML? | The fixture post produces HTML with no disallowed scheme. |

SP1 creates the repo, so it runs last of the four or alone at the checkpoint.
SP2, SP3 and SP4 touch no shared state and run in parallel.

## How a unit runs

Every unit is one experiment.

1. State the hypothesis as a sentence with a predicate in it.
2. Make the smallest change that could falsify it.
3. Measure against the predicate on the real artifact.
4. Keep it if it advanced the predicate. Revert it if it did not.
5. Write the verdict.

A verdict is VERIFIED, NOT VERIFIED, or INCONCLUSIVE. INCONCLUSIVE is not a
pass and it never gets reported as one.

The measurement is always the artifact. The served page, not the build log. The
SQLite file, not the summary line. The request body, not the log line that
says the request was sent. When a check passes too easily, the observation
method is the first suspect, not the system.

## Gates

A gate is a check a reviewer can rerun. It is a script, not a sentence.

| Gate | Where | What it proves |
| --- | --- | --- |
| G1 | `npm run validate:design` | Every finding from the review is encoded in the specs or dismissed with a reason. |
| G2 | `npm run check:site` | The live URL returns the post body, the stylesheet resolves, and no disallowed URL scheme appears in the HTML. |
| G3 | `npm test` | The curator behaves against fixtures with no network and no provider credentials. |
| G4 | `npm run prove` | The whole predicate holds on the Pi, including the idempotent second run. |
| G5 | `npm run check:trail` | Every row in the decision trail resolves to evidence that exists. |

G2 and G4 are the lever. They are deterministic scripts a reviewer can rerun
without trusting a word from an agent.

## Fan-out

Wave 0 fans out because the four spikes have no shared state and each ends in
a binary verdict that only the reviewer can interpret.

The implementation waves do not fan out. Six leaf units of roughly sixty lines
each would share `package.json`, `tsconfig.json` and the type shapes that
decide them, so six branches would merge into more conflict than the
parallelism saves. The shared types get designed once, centrally, in the first
unit of Wave 3, and the leaf units run in sequence behind it.

Concurrency inside a single run is handled structurally rather than by
convention. Each article gets its own key in the state document family, so two
actors never mutate one shared list. The GitHub branch is a genuine single
write target, so the run holds an exclusive lock file over it and the lock
records the PID so a stale lock is recognisable.

## Idempotence

Every state-changing step answers three questions.

1. What happens if this runs twice?
2. What happens if the previous run crashed at every possible point?
3. Does re-execution converge to the same end state?

The publish answers them by treating an existing file with identical bytes as
success. The run loop answers them by deriving the work list from what exists
on the site rather than from what the previous run meant to do. The state
document answers them by recording attempts and the last error before the
attempt, so a crash is visible to the next run.

## The trail

`decisions.tsv` at the repo root, committed. This work is ambitious enough and
runs long enough that a reviewer needs the trail to trust the result.

One row per decision. Columns are timestamp, phase, decision, why, evidence
and result. Evidence is a pointer such as a commit SHA, a file and line, or a
gate output path. Never a paragraph.

The trail is append only. A wrong call gets a new row that supersedes it.

Every one of the 33 review findings gets a row when it is encoded or
dismissed. So does each spike verdict. So does each revert. The full
disposition table lives in
`openspec/changes/add-slopchop-newsletter/review-findings.md`.

## Checkpoint

One checkpoint, at the end of Wave 2, when the URL serves a real post for the
first time.

That is the first external side effect, and it is the moment the artifact
exists. Both prior attempts at this product failed because the artifact came
last. The checkpoint is where the reviewer looks at a URL instead of a plan.

Everything before it is local and reversible. The spikes, the design revision
and the build and publish code all run without a single external write.

## Out of scope

Named so they do not creep back in.

- MCP as the body-fetch path. The CLI is faster and keeps the model out of the
  loop. MCP stays available for discovery.
- Source kinds beyond `feed`. The union grows when a second kind is configured.
- Historical catch-up. The sources cannot support it, so a wrong-dated post is
  worse than a gap.
- A news-versus-knowledge split. The selection step subsumes it.
- Streaming the post. The post is a file.
- Any second reader, any auth on the site, any HA story.

## Run log

The architect checklist for the design, then the execution waves. One line per
phase, updated as it lands. The decision trail with evidence lives in
`decisions.tsv`.

### Architect phases

| Phase | What | State |
| --- | --- | --- |
| A. Ground | Read the installed pi-durable, pi-ai, contentlayer and lightpanda surfaces. Trace the submission to entry flow, the document model, the task and recovery model, context and compaction, and the observability surface. | done |
| B. Sketch | Two arena candidates over the curator core, separate output directories, then a cross-judge. | done |
| C. Agree | Pick a base, graft from the loser, write the rationale. | done, landed as `design.md` |
| D. Implement | Fill the sketch's `not implemented` bodies in wave order. | pending, starts at task 2.1 |
| E. Scrap | Re-architect if implementation friction repeats. | pending |

The grounding surfaced five facts the design session did not know. Two of them
changed the architecture, not just the implementation. `root(ctx, {agent})`
ignores the agent on an existing root, and pi-durable has no public way to
enumerate a document family. The arena artifacts are committed under
`openspec/changes/add-slopchop-newsletter/arena/` so a reviewer can see the
candidates the synthesis was made from.

### Execution waves

| Wave | State |
| --- | --- |
| 0. Spikes | pending, and now a gate on implementation rather than on the design |
| 1. Design revision into the OpenSpec change | done, `openspec validate` passes strict |
| 2. The spine | pending |
| 3. The curator core | pending |
| 4. Orchestration and the Pi | pending |
| 5. Hand back | pending |

Wave 1 ran before wave 0, which reverses the playbook's order. The architect
phase needed a design to sketch against, and the spikes that remained are the
ones the design already names as its open risks: the provider is untested from
here, and the publish chain has never been exercised end to end. Both are now
tasks 1.1 and 1.2, and both gate the spine rather than the design.

### Grounding results that changed the design

Five facts surfaced during grounding that the design session did not know.

1. **`root(ctx, {agent})` ignores the agent when the root already exists.**
   `harness/harness.js:261-263` returns early. The existing `src/harness.ts:19`
   therefore does not do what it looks like it does, and a changed `PI_MODEL`
   takes effect never.
2. **There is no public way to enumerate a document family.**
   `Storage.scanDocuments` exists but is not on Session, Tx, or Harness, and
   `harness.storage` is protected. Any design that needs "which articles have I
   handled" owns a key index, or gets the answer from the published artifact
   instead.
3. **`settled.answer` is an entry id, not a message.** The generation task
   writes the assistant entry itself. The commit that re-reads it is a read.
4. **`requestId` is idempotent per conversation.** `submit({requestId:
   "post-2026-10-30"})` is the crash-safe "did I already do today" hook.
5. **`inspect()` does not show failed submissions.** Only `queued` and
   `placed`. A failure is invisible to `inspect()`, so the run's own error
   path is the only signal.
