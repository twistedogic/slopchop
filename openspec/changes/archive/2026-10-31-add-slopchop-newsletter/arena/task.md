# Arena task: the module map and type sketch for slopchop's curator core

You are producing ONE candidate design in architect's parallel exploration. Read
`/Users/a012/.agents/skills/architect/SKILL.md` in full first. That is the
workflow you are inside. Read
`/Users/a012/.agents/skills/architect/references/rationale-template.md` for the
rationale shape and
`/Users/a012/.agents/skills/architect/references/design-red-flags.md` for the
screen every candidate faces.

Read `/tmp/arena-slopchop/grounding.md` before you start. It carries the
non-negotiable constraints and the library API facts.

## The artifact

A design package for the slopchop curator core. It contains:

1. The caller's usage, written first. A README-style quickstart plus two or
   three real call sites in the app's own code. The usage is the spec.
2. The type sketch. Core types, function signatures, module boundaries. Function
   bodies are `not implemented` throws or `// TODO` pseudocode. Doc comments
   state intent and invariants. A reader must be able to trace data from input
   to output by reading types and signatures alone.
3. The module map. Which file owns which knowledge. One owner per piece of
   state.
4. The rationale, shaped per `rationale-template.md`, with the italic notes
   replaced by real content.

Write your package to `/tmp/arena-slopchop/candidate-<a|b>/design.md`. Nothing
else. Do not modify any file outside that directory.

## What the product is

slopchop is an unattended technology-news pipeline. Once a day a cron job on a
Raspberry Pi runs it. It discovers recent tech articles from configured RSS
feeds, fetches each article body with the lightpanda headless browser, asks a
model to pick the few worth reading and to write them up as one long-form
markdown digest, and publishes that digest as a dated file to a GitHub Pages
site. The published URL is `https://twistedogic.github.io/slopchop/<YYYY-MM-DD>`.

One reader. One post a day. Nothing else.

## What is already settled, and is not yours to re-litigate

These came out of an adversarial review of the design. Violating one of them
makes the candidate wrong, not interesting.

1. One repository, `twistedogic/slopchop`. No Next.js and no React.
2. contentlayer 0.3.4 with `contentType: "markdown"` compiles markdown to HTML
   at build time. A Node build script renders one HTML template per post plus
   an index. Style consistency comes from that single template and one
   stylesheet.
3. The publisher writes through the GitHub Contents API PUT with Base64
   content. An existing file whose bytes match is treated as success, so a
   repeated publish converges.
4. Publish state derives from the published artifact, the Contents listing.
   There is no local publish ledger.
5. Durable state lives in the same SQLite storage, in typed pi-durable
   documents. A session-scoped `defineDocFamily` is the intended home.
6. The curator is a stateless model call per date. It is not a long-lived
   conversation that accumulates every article body it has ever read.
7. Each date gets its own fresh model context so days do not contaminate
   each other.
8. The model's output is untrusted. The links in the post are rendered from
   the candidate table in code, never copied from model prose. Only http and
   https schemes survive.
9. The app writes the frontmatter. The model writes only the body.
10. lightpanda runs through an argv array with no shell, with
    `--block-private-networks`, a hard deadline, an output cap, and bounded
    concurrency.
11. Fail hard means never publish a partial post. A date that fails is
    quarantined and later dates still publish.
12. Catch-up is bounded to the source coverage window. There is no historical
    backfill, because the sources cannot supply it.
13. Exactly one source adapter kind in v1. `feed`.
14. The run holds an exclusive lock for the whole run, because the GitHub
    branch is a genuine single write target.
15. `root.configure()` runs on every startup, so the provider and model come
    from one config source rather than from whatever the database remembers.
16. Provider default is `openai-codex` with model `gpt-6-sol`, overridable by
    environment variable. Credentials live in a file-backed CredentialStore.

## Where you are meant to differ from the other candidate

The design space below is genuinely open. Pick a position on each axis and
defend it. Do not split the difference, and do not hedge.

**(a) The candidate table.** What shape is a discovered article, and where does
that collection live between the discovery stage and the composition stage? An
in-memory array threaded through pure functions. A durable document written
incrementally, so a crash mid-run keeps the work already done. Something else
you can justify. Consider what happens to the thirty fetched bodies and where
the bytes live.

**(b) The per-day state.** How is the state of a date modelled? One document
family keyed by date holding a whole day record. Two families, one for the day
lifecycle and one for the article seen-set. One family keyed by date with a
nested map of articles. Something else. Consider what a reader would have to
know to answer "has this date been attempted, and how many times" and "have I
already handled this URL".

**(c) The model calls.** How many model calls per date, and what does each
one carry? One call that both ranks and composes. A cheap ranking call over
titles and feed metadata, then an expensive composition call over the few
selected bodies. One call per article, then a composition call. Consider the
token budget, the shape of the structured output, and where the untrusted text
sits relative to the instruction.

**(d) The curate and publish boundary.** Does one module own a whole day from
discovery to published file, or does curating return a value that a separate
publishing module consumes? Consider what a test can assert about each half.

**(e) The seen-set owner.** Does the published artifact serve as the only
seen-set, so publishing is what marks an article handled, or does the durable
document own it and the published artifact is just output? Consider the case
where a publish fails after the summaries were written.

Judge your shape against the design red flags. A design with a shallow module, a
split owner, two ways to do one task, a hand-synced list, or importable
internals will lose to a cleaner shape even if it is longer.

## Standards you are held to

- Caller's usage first, then the types derived from it.
- Data structures first. Trace each dominant access pattern through the
  structure you propose. If the answer is "we will add a map later", the
  structure is wrong.
- Interface depth. Prefer a small public surface that hides real complexity.
  Do not put wire types, storage schemas, or provider objects on the public
  API. Parse external data into domain types behind the interface.
- Encode invariants in types where you can. Hard-to-misuse types beat runtime
  checks beat prose.
- Validate at boundaries, trust types inside. Business logic as pure
  functions. The shell stays thin.
- One source of truth per invariant. Derive, do not sync.
- Short call chains. If tracing the flow needs more than three files,
  flatten the hierarchy.
- Make the boundaries visible. `not implemented` bodies, `// TODO` for tricky
  logic, doc comments for intent and invariants.

Produce the best design your model can make. Do not hedge against the other
candidate. Difference is the signal.
