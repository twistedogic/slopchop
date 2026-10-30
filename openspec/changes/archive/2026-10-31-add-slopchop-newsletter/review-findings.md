# Review findings and their dispositions

Two adversarial reviews of the design ran in one session. Both were on the same
model, because the harness offered only one, so their agreement is weaker
evidence than two independent models would give. Between them they raised
33 findings.

Every finding is listed here with its disposition and where it landed. A finding
that became a requirement points at the requirement. A finding that was
dismissed says why.

Reviewer A is `arena/candidate-a`'s sibling, the first review. Reviewer B is the
second. The letters A and B below mean the reviewer, not the arena candidates.

## The thirteen that became requirements

| # | Reviewer | Severity | Finding | Where it landed |
| --- | --- | --- | --- | --- |
| A1 | A | critical | The publish chain had no build step and mixed two branches, so a successful publish would leave the site stale | `design.md`, Site build and deployment. Publisher spec, Site build and deployment. Tasks 1.1, 3.2 |
| A2 | A | critical | The transcript cannot serve as a seen-set, because it matches urls merely mentioned inside article bodies, and it poisons itself when a publish fails | `design.md`, The seen-set belongs to the published artifact. Publisher spec, Publish state comes from the published artifact. Task 3.4 |
| A3 | A | critical | Fail hard plus catch-up has no terminal state, and the retry counter had nowhere to live | `design.md`, Bounded attempts and quarantine. Curator spec, Attempt-scoped model requests. Tasks 2.3, 5.2 |
| A4 | A | critical | One root conversation accumulates every article body, so the cost estimate was wrong and compaction starts summarizing the bodies | `design.md`, A day is its own conversation. Task 4.4 |
| A5 | A | critical | The fetched bodies reach the model and the model's markdown reaches a public page, with no scheme check | `design.md`, The renderer owns every link. Publisher spec, Post rendering. Tasks 1.4, 4.5 |
| A6 | A | warning | The lightpanda subprocess had no argv, timeout, output cap, concurrency bound or private-network block | `design.md` Risks. Curator spec, Article body acquisition. Task 4.2 |
| A7 | A | warning | The core data flow was undefined and nobody said who writes the candidate summaries | `design.md`, Two model calls. Tasks 4.3, 4.4 |
| A8 | A | warning | The default provider is OAuth only and the credential store had no home | `design.md` Risks. Task 5.3, and the one-time credential step in 6.1 |
| A9 | A | warning | Catch-up cannot produce the day it is catching up on, because the sources are current-state only | `design.md` Non-Goals, and the coverage window decision. Publisher spec, Run date selection. Task 5.2 |
| A10 | A | warning | No run lock, and the list-then-create sequence is a race | `design.md`, Run locking. Publisher spec, Run locking. Task 5.1 |
| A11 | A | warning | The build is the failure boundary and nothing guarded it | Publisher spec, Site build and deployment. Tasks 3.2, 3.5 |
| A12 | A | warning | Nothing in the design was testable | Every task states its verification. Gates 3.5, 4.6, 5.4 |
| A13 | A | warning | Untrusted titles are laundered into an author-branded page | Publisher spec, Post rendering. Task 4.5 |

## The rest, and why they did not become requirements

| # | Reviewer | Severity | Finding | Disposition |
| --- | --- | --- | --- | --- |
| A14 | A | nit | The source kind union is speculative and one member is not expressible by a url | Accepted as a scope decision rather than a requirement. Only `feed` ships. `design.md` Non-Goals |
| A15 | A | nit | The token scope is too broad, and `gh` keeps its token in a keychain a Pi does not have | Accepted. The README task 6.1 covers the secret path and the scope |
| A16 | A | nit | Token caps without a tokenizer, and the provider specified in three places | Accepted. Caps are bytes. One config source. `design.md`, The day is its own conversation. Task 2.4 |
| B1 | B | critical | The environment-selected provider and model do not update an existing session | Accepted. Task 2.4 exists for this alone. `design.md` Context |
| B2 | B | critical | The publish command sends the wrong content encoding | Accepted. Publisher spec, Publication through the Contents API. Task 3.3 |
| B3 | B | critical | The publisher, the state query and Pages name three different branches | Accepted. `design.md`, The site is one branch, one workflow, and one encoding. Task 3.4 |
| B4 | B | critical | Committing content does not produce or deploy the built output | Accepted. Same as A1 |
| B5 | B | critical | The browser fetch boundary has no url, process, timeout or resource policy | Accepted. Same as A6 |
| B6 | B | critical | Indirect prompt injection, and the output is not a safe html boundary | Accepted. Same as A5. The structural answer is that the model answers with references |
| B7 | B | critical | A truncated answer counts as success and can be published | Accepted. Curator spec, Digest composition. Task 4.3 |
| B8 | B | critical | Fail hard and catch-up have no viable terminal state | Accepted. Same as A3 |
| B9 | B | critical | Historical catch-up cannot be reconstructed from the sources | Accepted. Same as A9 |
| B10 | B | critical | Free-text transcript scanning is not a valid state store | Accepted. Same as A2 |
| B11 | B | warning | Reusing one root conversation invalidates the token and cost estimate | Accepted. Same as A4 |
| B12 | B | critical | The directory listing is neither complete nor concurrency safe | Accepted. The tree mechanism and the lock. Tasks 3.4, 5.1 |
| B13 | B | warning | Date ownership, timezone, cutoff and catch-up anchor are undefined | Accepted. The configured timezone and the coverage window. Tasks 4.1, 5.2 |
| B14 | B | warning | The default provider has no unattended authentication bootstrap | Accepted. Same as A8 |
| B15 | B | warning | The unattended build depends on unpinned external tools | Accepted. contentlayer pinned, lightpanda pinned. Tasks 2.1, 1.3 |
| B16 | B | warning | The proposed verification does not cover the new failure modes | Accepted. Same as A12 |

## Where a finding was wrong, and why

Two of the thirty-three rested on a premise the grounding later disproved, and
they are recorded here so the reasoning is auditable rather than silently
dropped.

- **The assumption that a document family can be enumerated.** Several
  findings proposed a url-keyed family owning the seen-set, with a key index
  beside it. The grounding found that pi-durable exposes no public scan, so
  that shape needs an index the app would own and keep correct. The published
  artifact answers the question instead, and no index exists.
- **The assumption that a failure can be detected from the archive.** A gap and
  a failed date look the same from the public archive. The distinction moved to
  the run report, and task 6.2 makes that report durable so an old gap can
  still be explained.

## The two holes that were reproduced rather than argued

A5 and B6 both rested on a claim that had been measured too narrowly. The
earlier measurement showed that a raw `<script>` tag is dropped by
contentlayer's markdown pipeline, and that was read as "the output is safe". It
says nothing about link destinations.

The committed reproduction at `arena/repro/` settles both. It shows a
`javascript:` destination surviving unchanged, a `data:` destination surviving
unchanged, a url written as a plain destination being truncated at its first
closing parenthesis with the remainder leaking into the visible text, and a url
written as an angle bracket destination surviving whole. The expected output is
committed beside the script, so the claim is diffable rather than asserted.
