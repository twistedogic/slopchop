# slopchop curator core — candidate B

Design package for the unattended tech-news pipeline: one post a day at
`https://twistedogic.github.io/slopchop/<YYYY-MM-DD>`.

Every API below was checked against the installed `@earendil-works/pi-durable`
and `@earendil-works/pi-ai` type declarations; the durable record type and the
advance/commit pattern in `day.ts` were compiled against the real
`defineDocFamily`, `tx.doc`, and `Draft<T>` before this package was written.

---

## Problem

slopchop runs once a day on a Pi: discover articles from configured RSS feeds,
fetch their bodies with lightpanda, let a model pick the few worth reading and
write them up, and publish one markdown file per date through the GitHub
Contents API. The whole thing is unattended, so the pipeline has to survive a
crash, a flaky provider, and a half-open GitHub without ever publishing a
partial post.

The shape is not obvious because of four facts that pull in different
directions, and the design has to honour all four at once.

**The library will not tell us what we already know.** pi-durable has no public
way to enumerate a document family, so any design that needs "all the dates we
have seen" must own a key index. This design refuses to need that: the set of
dates to publish is derived from the feeds' own coverage, and publish state is
derived from the published artifact, so the durable family is only ever read by
a key we already hold.

**The model's output is untrusted, and it writes the post.** The app writes the
frontmatter, so the model's contribution to the body has to be data the app
renders, not markup the app trusts. The measured contentlayer behaviour
(`[x](javascript:alert(3))` survives the build) means the links in a post must
come from code, and the cheapest way to guarantee that is to never give the
model a way to write one.

**A crash is normal, not exceptional.** The process can die between the model
call and the write that records it. `root.submit` accepts a `requestId` that is
idempotent per conversation, and `settled.answer` is an *entry id*, not a
message: the answer is re-read from the transcript. That is the hook that makes
a day's model output recoverable instead of merely repeatable.

**The reader is one person and the artifact is the truth.** Publish state comes
from the Contents listing, not from a local flag, so a local flag can never
disagree with what the reader can actually see.

---

## Usage (caller's view)

### Quickstart

```
$ npm start -- run
2026-10-29  published  content/2026-10-29.md   5 items  6120 in / 2140 out tokens
2026-10-30  skipped    nothing worth publishing
2 dates, 1 published, 1 skipped, 0 failed
```

```
$ npm start -- ask "what did you publish yesterday?"
```

### Call site 1 — the cron entry point (`src/cli.ts`)

The shell does wiring and nothing else: parse argv, build the two network
ports, call the run, print the report, set the exit code.

```ts
const [command, ...rest] = process.argv.slice(2);
const cfg = loadConfig(process.env);

if (command === "run") {
	const deps: RunDeps = {
		now: () => new Date(),
		source: feedSource(cfg),
		publisher: githubPublisher(cfg),
	};
	const report = await runOnce(cfg, deps, context);
	printReport(report);
	process.exitCode = report.failed.length > 0 ? 1 : 0;
} else {
	// The operator path: the root conversation, configured from config on startup.
	const question = rest.join(" ").trim();
	if (!question) {
		console.error("usage: npm start -- run | ask <question>");
		process.exit(1);
	}
	const { harness, root } = await openSession(cfg);
	try {
		const submission = await root.submit({ type: "input", content: question }, context);
		const settled = await submission.wait(context);
		if (settled.status !== "done" || settled.type !== "input") {
			console.error(`no answer (${settled.status}): ${settled.reason}`);
			process.exitCode = 1;
		} else {
			const answer = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
			console.log(entryText(answer));
		}
	} finally {
		await harness.close(context);
	}
}
```

### Call site 2 — one date's attempt (`src/run.ts`)

The whole policy for a date in one function: what to skip, what to resume, what
to freeze, what to publish.

```ts
async function attemptDate(
	cfg: Config,
	deps: RunDeps,
	harness: Harness,
	date: IsoDate,
	items: readonly FeedItem[],
	published: ReadonlySet<IsoDate>,
	ctx: Context,
): Promise<DateOutcome> {
	const day = await readDay(harness, date, ctx);

	// 1. The artifact is the publish state: a published date is done.
	if (published.has(date)) return { kind: "skipped", reason: "already published" };

	// 2. A curated date is re-published, never re-curated: same bytes, converges.
	if (day?.stage === "curated") {
		return publishDigest(deps, date, day.digest, ctx);
	}

	// 3. A date whose curation failed too often is abandoned, so a run never loops.
	if (day && day.attempts >= cfg.maxAttempts) {
		return { kind: "skipped", reason: `abandoned after ${day.attempts} attempts` };
	}

	// 4. Curate. A scanned date with no recorded failure resumes: the same
	//    attempt, the same conversation, the same request ids, so the model is
	//    not asked twice. A failed attempt starts a new one.
	const resuming = day?.stage === "scanned" && day.error === null;
	const ordinal = resuming ? day.attempts : (day?.attempts ?? 0) + 1;
	const conversation = await dayConversation(harness, resuming ? day : undefined, cfg, ctx);
	const attempt: Attempt = { conversation, date };

	// The attempt is recorded before the network work, so even a crash counts.
	await advanceDay(harness, date, { stage: "opened", attempts: ordinal, conversationId: conversation.id, error: null }, ctx);

	// The bodies. On a first attempt they are the bodies of the feed's items;
	// on a resume they are the bodies of the frozen candidates, fetched again.
	const articles = resuming
		? await deps.source.bodies(day.candidates.map((c) => c.url))
		: await deps.source.bodies(items.map((i) => i.url));

	// The candidate list is frozen before the model sees it: a ref is an index
	// into it, and the list does not change for the life of the date.
	const candidates = resuming ? day.candidates : freezeCandidates(articles);
	if (candidates.length === 0) {
		await advanceDay(harness, date, { stage: "opened", attempts: ordinal, conversationId: conversation.id, error: failure("no article could be fetched") }, ctx);
		return { kind: "failed", reason: "no article could be fetched" };
	}
	await advanceDay(harness, date, { stage: "scanned", attempts: ordinal, conversationId: conversation.id, candidates, error: null }, ctx);

	// The table pairs the frozen list with the bodies fetched for it. A body
	// that could not be fetched leaves its candidate without text; the ref still
	// means the same article.
	const table = candidateTable(candidates, articles);

	// Two model calls: a cheap choice over titles and openings, then the write-up.
	const chosen = await selectArticles(attempt, table, ctx);
	const selected = chosen.value.map((ref) => table[ref]).filter((c): c is Candidate => c !== undefined);
	const written = await composeSections(attempt, selected, ctx);
	const digest: Digest = {
		date,
		items: written.value
			.filter((s) => s.ref >= 0 && s.ref < table.length)
			.map((s) => ({ source: table[s.ref]!.source, prose: s.prose })),
	};
	await advanceDay(harness, date, { stage: "curated", attempts: ordinal, conversationId: conversation.id, candidates, digest, error: null }, ctx);

	return publishDigest(deps, date, digest, ctx);
}
```

### Call site 3 — the test that holds the product's promise

One fake source, one fake publisher, one real database. The assertion is that
the post's links are the ones the renderer wrote and that nothing the model
wrote can become one.

```ts
test("a date publishes one post whose links come from the candidate table", async () => {
	const source = fakeSource([
		{ url: "https://example.com/rust", title: "Rust 2.0 ships", body: "A long article.", publishedAt: isoInstant("2026-10-29T10:00:00Z") },
	]);
	const publisher = fakePublisher();
	const report = await runOnce(testConfig(), { now: () => new Date("2026-10-30T00:00:00Z"), source, publisher }, context);

	assert.deepEqual(publisher.puts.map((p) => p.path), ["content/2026-10-29.md"]);
	const bytes = new TextDecoder().decode(publisher.puts[0]!.bytes);
	assert.match(bytes, /\]\(<https:\/\/example\.com\/rust>\)/); // renderer-written link
	assert.doesNotMatch(bytes, /javascript:/);                   // nothing the model wrote became a link
});
```

---

## Shape

### The five positions

| Axis | Position |
|---|---|
| (a) candidate table | An **in-memory array** of `Candidate` per date. Its index is the `ref` the model answers with. Only the *identity* half (`Source`) is durable; the bodies are not. |
| (b) per-day state | **One session-scoped family keyed by date**, whose value is a three-stage sum type: `opened → scanned → curated`. No second family, no key index, no nested article map. |
| (c) model calls | **Two.** A cheap `select` over titles and body openings, then a `compose` over the full bodies of the few chosen. |
| (d) curate/publish boundary | **Curate returns a `Digest`; a separate publisher consumes it.** `renderPost` sits between them as a pure function. |
| (e) seen-set owner | **Neither.** The unit of publication is the *date*, not the article. There is no article-level seen-set anywhere. |

### Data structures

Four structures carry everything. Each is traced through its dominant access.

**1. The candidate table — `Candidate[]`, in memory, per date.**

The dominant access is "the model said ref 7, give me article 7". That is an
array index, so the candidates are an array and a `ref` *is* an index. The
second dominant access is "the same ref must still mean the same article after
a crash", which is why the array is **frozen**: the moment the list is built it
is written to the durable record, and a resumed attempt reads the frozen list
back instead of rebuilding it from a feed that may have moved on. A ref that
was an index into a re-derived list would silently point at a different
article; a ref into a frozen list cannot.

The bodies are the bulk (30 articles × 8 kB) and the cheapest thing to
recompute — a refetch is thirty seconds of lightpanda. They stay in memory.
The part that is *not* recomputable — the model's choice and prose — is
protected by the request id, not by a copy of the input.

**2. The day record — one document per date, in a session-scoped family.**

The dominant access is "what do I know about this date?", answered by a single
keyed snapshot: `snapshot(DayDoc, date)`. O(1), no enumeration.

The second access is "write the next state of this date", which is why the
value is a **sum type** rather than a bag of nullable fields: a curated day
*always* has candidates and a digest, and the compiler says so.

```ts
type DayRecord =
  | { stage: "opened";  attempts: number; conversationId: ConversationId; error: Failure | null }
  | { stage: "scanned"; attempts: number; conversationId: ConversationId; candidates: Source[]; error: Failure | null }
  | { stage: "curated"; attempts: number; conversationId: ConversationId; candidates: Source[]; digest: JsonRepresentation<Digest>; error: Failure | null };
```

The family is keyed by date and the **key set is never enumerated**. The dates
to publish come from the feeds' coverage; publish state comes from the
artifact; the day record is only ever read by a date the run already holds.
That is what removes the need for a key index, and it is the single most
load-bearing decision in this package: it is what lets the durable state be a
family instead of a hand-synced list of families.

**3. The digest — the value between curate and publish.**

`Digest` is the only thing that crosses the curate/publish boundary. It holds
the selected articles' *identity* and the model's prose, and nothing else: no
transport type, no storage schema, no provider object. The publisher receives
bytes; the curator returns meaning.

**4. The published artifact — the Contents listing and the files.**

The listing gives the published dates. The bytes of one file give the
publish state of one date. Nothing local duplicates either.

### The flow

```
cron ──▶ cli.ts ──▶ run.ts ──┬── source.items()        → FeedItem[]        (network)
                              ├── publisher.published() → path[]            (network)
                              ├── bucket by local date, drop today, drop published
                              └── for each date, oldest first:
                                     day.readDay(date)                        (storage)
                                     ├── skip: published / abandoned
                                     ├── source.bodies(urls) → Article[]       (network)
                                     ├── day.advanceDay(... "scanned")          (storage)
                                     ├── model.select  → refs                  (model)
                                     ├── model.compose → prose                 (model)
                                     ├── day.advanceDay(... "curated")          (storage)
                                     ├── post.renderPost(digest) → bytes       (pure)
                                     └── publisher.put(path, bytes)             (network)
```

Four files own the flow's decisions: `run.ts` (which dates), `curate.ts` (what
is worth reading), `post.ts` (what a post looks like), `publish.ts` (how bytes
reach the reader). `source.ts`, `model.ts`, `day.ts` and `lock.ts` are leaves
under them. Nothing nests deeper than two.

### Invariants, and where they live

1. **Publish state is the artifact.** `run.ts` asks `publisher.published()` and
   never reads a local "published" flag, because there is none. The day record
   has no `published` field at all.
2. **A day's context is its own.** Each attempt gets its own conversation
   (`harness.createConversation`). The root conversation belongs to the
   operator and is never used by the curator, so a day's context cannot contain
   an operator's question, another day's bodies, or a previous failed attempt.
   The curator's conversations are configured with the same agent change the
   root gets, so the provider and model come from one config source.
3. **The model writes data, not markup.** The model answers with JSON
   (`{"refs":[...]}` / `{"sections":[{"ref":7,"prose":"..."}]}`). The app
   renders every markdown construct. The model's prose is escaped before it
   reaches the file.
4. **A link in a post is a link the renderer wrote.** Links come from
   `Source.url`, which is an `HttpUrl` — a branded string that only the source
   adapter can mint, and only for `http`/`https` URLs with no credentials. The
   renderer writes them as `<...>` destinations so a `)` or a space cannot break
   out of the link.
5. **An attempt is idempotent.** The model calls carry
   `requestId: "select-<date>"` / `"compose-<date>"`. Re-submitting returns the
   same submission; the answer is re-read from the transcript through its
   entry id. A crashed attempt resumes for free.
6. **The stage only advances.** `opened → scanned → curated`. The record's key
   set grows, never shrinks, so `Object.assign` over the draft is a faithful
   advance.
7. **One writer per piece of state.** `day.ts` is the only writer of the day
   family. `publish.ts` is the only writer of the artifact. `post.ts` is the
   only owner of the post format.

### Interface depth

The public surface is small and each piece of it hides real work.

- `runOnce(cfg, deps, ctx) → RunReport` — one function hides the lock, the
  harness lifecycle, the date selection, the stage machine, the attempt
  budget, the quarantine, and the publish state derivation.
- `renderPost(digest) → bytes` — one pure function hides the frontmatter
  contract, the escaping rule, and the link form.
- `ArticleSource` — two methods; hides the RSS parser, the URL canonicalizer,
  and the lightpanda argv, the deadline, the byte cap, and the concurrency
  limit.
- `PostPublisher` — two methods; hides base64, the sha, the "bytes already
  match" check, and the Contents API paths.
- `DayDoc` + `readDay` / `advanceDay` — hides the family definition, the seed,
  and the Draft mechanics.

What stays exposed: the `Digest` (the product's meaning), the day record (the
operator's view of a date), and the two ports. What does not: pi-durable's
`Draft`, `Op`, `Tx`, `Session` internals, the GitHub wire format, the feed XML
shape, and lightpanda's flags. The feed's XML and the GitHub's JSON are parsed
into domain types at their boundaries and never travel further.

### What this deliberately does not do

- No article-level seen-set. The unit of publication is the date.
- No local publish ledger.
- No historical backfill: the feeds' coverage is the window.
- A second source adapter kind, a streaming publish, a partial post, a
  per-article retry budget, a post template engine, or a `secrets` manager.
- No local store of fetched bodies.

---

## Type sketch

### `src/types.ts` — the domain vocabulary (leaf)

```ts
/** A calendar date in the publisher's local time, "YYYY-MM-DD". */
export type IsoDate = string & { readonly __isoDate: unique symbol };

/** An absolute http(s) URL that passed the source adapter's canonicalization. */
export type HttpUrl = string & { readonly __httpUrl: unique symbol };

/** An absolute instant, ISO-8601 in UTC. */
export type IsoInstant = string & { readonly __isoInstant: unique symbol };

/**
 * One article's identity: what the post links to and what the model was shown.
 * This is the half of an article the durable candidate list keeps.
 */
export type Source = {
	readonly url: HttpUrl;
	readonly title: string;
	readonly outlet: string;
	readonly publishedAt: IsoInstant;
};

/** An article as the model sees it: the identity plus the body that was fetched. */
export type Article = Source & {
	readonly body: string;
};

/** One item of the digest: a source and the model's prose about it. */
export type DigestItem = {
	readonly source: Source;
	/** The model's prose, unescaped. The renderer escapes it; nothing else may. */
	readonly prose: string;
};

/** The day's digest: everything the publisher needs, and nothing else. */
export type Digest = {
	readonly date: IsoDate;
	readonly items: readonly DigestItem[];
};

/** Why an attempt failed, and when. */
export type Failure = {
	readonly at: IsoInstant;
	readonly message: string;
};
```

### `src/config.ts` — one source of truth for the environment

```ts
export type FeedConfig = { readonly url: string };

export type Config = {
	readonly dbPath: string;
	readonly provider: string;      // "openai-codex"
	readonly modelId: string;       // "gpt-6-sol"
	readonly feeds: readonly FeedConfig[];
	readonly github: {
		readonly owner: string;
		readonly repo: string;
		readonly branch: string;
		readonly token: string;
	};
	readonly lockPath: string;
	/** Curations of one date before it is abandoned. */
	readonly maxAttempts: number;
	/** The hard deadline of one body fetch. */
	readonly bodyTimeoutMs: number;
	/** The cap on one fetched body, before it is trimmed for the prompt. */
	readonly bodyMaxBytes: number;
	/** How many body fetches run at once. */
	readonly concurrency: number;
};

/** Read the configuration from the environment and the config file. */
export function loadConfig(env: NodeJS.ProcessEnv): Config;

/** The agent every conversation of this app uses. One value, from one source. */
export function agentChange(cfg: Config): AgentChange;
```

### `src/session.ts` — the harness and the model registry

```ts
export const context = BACKGROUND_CONTEXT;

/**
 * Open the durable session and its root conversation.
 * The root is the operator's conversation: `root.configure()` runs on every
 * startup so its model comes from config, not from what the database remembers.
 */
export async function openSession(cfg: Config): Promise<{ harness: Harness; root: Conversation }>;

/**
 * The conversation one curation attempt talks to.
 * A resumed attempt reuses the recorded conversation so its request ids still
 * resolve; a new attempt gets a fresh one, so no day's context can hold
 * another day's bodies.
 */
export async function dayConversation(
	harness: Harness,
	day: DayRecord | undefined,
	cfg: Config,
	ctx: Context,
): Promise<Conversation>;
```

### `src/source.ts` — the one adapter kind: `feed`

```ts
/** One item as a feed offers it. The URL is already canonical: a feed URL that
 *  cannot be an `HttpUrl` was dropped when the feed was parsed. */
export type FeedItem = {
	readonly url: HttpUrl;
	readonly title: string;
	readonly outlet: string;
	readonly publishedAt: IsoInstant;
};

/** Where articles come from. The only network boundary of the curator. */
export interface ArticleSource {
	/** Every item the configured feeds offer, deduplicated by canonical URL. */
	items(): Promise<readonly FeedItem[]>;
	/**
	 * The bodies of the given URLs, in the order given.
	 * A URL that cannot be fetched is left out: a dead link is never offered to
	 * the model, and never reaches the post.
	 */
	bodies(urls: readonly HttpUrl[]): Promise<readonly Article[]>;
}

/** The cap on the body text one article contributes to a prompt. */
export const BODY_CHARS = 8000;

/** The feed adapter: RSS and Atom over plain HTTP, bodies through lightpanda. */
export function feedSource(cfg: Config): ArticleSource;

/**
 * Canonicalize a feed URL into an `HttpUrl`.
 * Only http and https survive; a URL with credentials, a non-default port it
 * does not need, or a fragment that identifies nothing is rejected.
 * @throws when the URL cannot be an `HttpUrl`
 */
export function httpUrl(raw: string): HttpUrl;

/** The local calendar date of an instant, in the publisher's time zone. */
export function localDate(at: Date): IsoDate;

/** The instant an ISO-8601 timestamp names. */
export function isoInstant(raw: string): IsoInstant;
```

Body fetching is the one place lightpanda appears, and it is argv-only:

```ts
// TODO: spawn("lightpanda", ["fetch", "--dump", "markdown", "--strip-mode", "ui",
//   "--block-private-networks", "--terminate-ms", String(cfg.bodyTimeoutMs),
//   "--dump-max-bytes", String(cfg.bodyMaxBytes), url]) with no shell.
// Cap the decoded markdown at BODY_CHARS and drop the rest.
```

### `src/model.ts` — the two model calls and the JSON contract

```ts
/** One attempt at one date: the conversation it talks to. */
export type Attempt = {
	/** The conversation of this attempt. Fresh per attempt. */
	readonly conversation: Conversation;
	/** The date being curated. Part of every request id. */
	readonly date: IsoDate;
};

/** The refs the model chose, validated against the candidate table. */
export type Selection = readonly number[];

/** One composed section: a ref into the candidate table and the model's prose. */
export type Section = { readonly ref: number; readonly prose: string };

/** What one model call cost, in tokens. */
export type CallUsage = { readonly input: number; readonly output: number };

/** One model call's answer and its cost. */
export type ModelAnswer<T> = { readonly value: T; readonly usage: CallUsage };

/** The most articles one digest may carry. */
export const MAX_ITEMS = 6;

/** How much of a body the selection call sees. */
export const EXCERPT_CHARS = 700;

/**
 * Ask which candidates are worth reading.
 * The prompt carries each candidate's title, outlet and the opening of its
 * body. The answer carries refs, never URLs: the model never spells a URL, so
 * it cannot invent one.
 */
export async function selectArticles(
	attempt: Attempt,
	table: CandidateTable,
	ctx: Context,
): Promise<ModelAnswer<Selection>>;

/**
 * Ask for the write-up of the chosen candidates.
 * The prompt carries each candidate's full body. The answer carries a ref and
 * plain prose; the prose is data, and the renderer escapes it.
 */
export async function composeSections(
	attempt: Attempt,
	selected: readonly Candidate[],
	ctx: Context,
): Promise<ModelAnswer<readonly Section[]>>;

/**
 * Read the model's JSON answer.
 * Tolerates a fenced block and prose around the JSON; rejects anything whose
 * shape or refs do not match the candidate table.
 * @throws ModelOutputError
 */
export function parseSelection(text: string, candidateCount: number): Selection;

/** Read the model's JSON answer for the write-up. @throws ModelOutputError */
export function parseSections(text: string, candidateCount: number): readonly Section[];
```

The call itself is the house pattern, with the request id that makes it
resumable:

```ts
// TODO: const submission = await attempt.conversation.submit(
//   { type: "input", content: prompt, requestId: `select-${attempt.date}` }, ctx);
// const settled = await submission.wait(ctx);
// if (settled.status !== "done" || settled.type !== "input") throw new ModelCallError(
//   `${settled.reason}: ${JSON.stringify(settled.detail ?? null)}`);   // the raw provider error is in `detail`
// const entry = await attempt.conversation.commit((tx) => tx.entry(AssistantEntry, settled.answer), ctx);
// const message = entry?.model?.[0];
// const usage = message?.role === "assistant" ? message.usage : undefined;
```

### `src/curate.ts` — the candidate table and the day's curation

```ts
/** One candidate of the table: the frozen identity, and the body fetched for it. */
export type Candidate = {
	/** The candidate's ref: its position in the table. The model answers with it. */
	readonly ref: number;
	readonly source: Source;
	/** The body fetched for this attempt, or null when it could not be fetched. */
	readonly body: string | null;
};

/**
 * The candidate table of one date: the frozen list, in one order, for the life
 * of the date. A candidate's position in the table is the `ref` the model
 * answers with.
 */
export type CandidateTable = readonly Candidate[];

/** The identity half of an article: what the durable list keeps. */
export function toSource(article: Article): Source;

/** The frozen identity list of the articles that could be fetched. */
export function freezeCandidates(articles: readonly Article[]): Source[];

/**
 * Pair the frozen list with the bodies fetched for it.
 * A candidate whose body could not be fetched keeps its place with a null body:
 * the ref space never moves, so a ref from an earlier attempt still names the
 * same article.
 */
export function candidateTable(
	candidates: readonly Source[],
	articles: readonly Article[],
): CandidateTable;


```

### `src/post.ts` — the post format (pure)

```ts
/**
 * The frontmatter fields the contentlayer document type declares.
 * One list: `contentlayer.config.ts` imports it, so the build fails when the
 * two disagree instead of publishing a post the site cannot render.
 */
export const FRONTMATTER_FIELDS = ["title", "date"] as const;

/** Where a date's post lives in the published artifact. */
export function postPath(date: IsoDate): string;

/** The date a published path holds, or undefined when the path is not a post. */
export function dateFromPath(path: string): IsoDate | undefined;

/**
 * Render a digest as the bytes of a post: frontmatter, then the body.
 *
 * Every markdown construct is written here, never taken from the model. Links
 * come from `Source.url` and are written as `<...>` destinations.
 */
export function renderPost(digest: Digest): Uint8Array;

/**
 * Escape the markdown that could carry a link.
 * The model's prose is plain text: this turns it into text that renders as
 * itself, so the post's links are exactly the ones the renderer wrote.
 */
export function escapeMarkdown(text: string): string;
```

### `src/publish.ts` — the published artifact

```ts
/** What a put did. */
export type PutOutcome = "created" | "unchanged" | "updated";

/** Where posts go. The only write boundary of the pipeline. */
export interface PostPublisher {
	/** The paths already in the published artifact. */
	published(): Promise<readonly string[]>;
	/**
	 * Put bytes at a path.
	 * "unchanged" means the artifact already held exactly these bytes, so a
	 * repeated publish converges instead of rewriting the post.
	 */
	put(path: string, bytes: Uint8Array): Promise<PutOutcome>;
}

/** The GitHub Contents API. */
export function githubPublisher(cfg: Config): PostPublisher;
```

### `src/day.ts` — the durable record of a date

```ts
/**
 * The durable record of one date, keyed by date, session-scoped.
 *
 * `initial` runs only when the member is absent, so the seed is the record a
 * fresh date starts with. The family is never enumerated: the run reads it by
 * a date it already holds.
 */
export const DayDoc = defineDocFamily<DayRecord, DayRecord>({
	kind: "slopchop.day",
	version: 1,
	family: true,
	scope: "session",
	initial: (seed) => seed,
	// The record is small and rewritten whole; a base keeps the delta chain flat.
	checkpointWhen: () => true,
});

/** Read the record of a date. Undefined when the date was never attempted. */
export function readDay(harness: Harness, date: IsoDate, ctx: Context): Promise<DayRecord | undefined>;

/**
 * Write the next state of a date. The only writer of `DayDoc`.
 * `next` is the complete record: it seeds a fresh member and overwrites an
 * existing member field by field. Stages only advance.
 */
export function advanceDay(
	harness: Harness,
	date: IsoDate,
	next: DayRecord,
	ctx: Context,
): Promise<void>;
```

The advance, in full, because the mechanics are not obvious:

```ts
export async function advanceDay(harness, date, next, ctx) {
	await harness.commit(async (tx) => {
		const draft = await tx.doc(DayDoc, date, next);
		// Object.assign, not object spread: the draft forbids defineProperty.
		Object.assign(draft, next);
	}, ctx);
}
```

### `src/lock.ts` — the run lock

```ts
export type Lock = { release(): Promise<void> };

/**
 * Take the run lock: one process owns the published artifact at a time.
 * A lock whose owning process is gone is taken over, so a crash does not
 * wedge the pipeline forever.
 */
export async function acquireLock(path: string): Promise<Lock>;
```

### `src/run.ts` — the run policy

```ts
/** What one date's attempt did. */
export type DateOutcome =
	| { readonly kind: "published"; readonly date: IsoDate; readonly path: string; readonly items: number }
	| { readonly kind: "skipped"; readonly date: IsoDate; readonly reason: string }
	| { readonly kind: "failed"; readonly date: IsoDate; readonly reason: string };

/** What one run did. The CLI prints it; nothing else reads it. */
export type RunReport = {
	readonly published: readonly DateOutcome[];
	readonly skipped: readonly DateOutcome[];
	readonly failed: readonly DateOutcome[];
	readonly usage: CallUsage;
};

/** Everything the run needs that is not the durable store. */
export type RunDeps = {
	readonly now: () => Date;
	readonly source: ArticleSource;
	readonly publisher: PostPublisher;
};

/**
 * Run the pipeline once: discover, curate, publish.
 *
 * Holds the run lock for the whole run. Publishes every date the feeds cover
 * that is not already published, oldest first. A date that fails is recorded
 * and the run moves on.
 */
export async function runOnce(cfg: Config, deps: RunDeps, ctx: Context): Promise<RunReport>;

/**
 * Put one digest in the published artifact.
 * The bytes are a pure function of the digest, so a repeated publish of the
 * same digest converges: the publisher reports "unchanged" and the reader's
 * page does not move.
 */
async function publishDigest(
	deps: RunDeps,
	date: IsoDate,
	digest: Digest,
	ctx: Context,
): Promise<DateOutcome>;
```

`runOnce` derives the dates to publish from the feeds' own coverage — the
local date of every item's `pubDate`, minus today, which is not finished yet —
so the set of dates is a function of the feeds and the clock, never of what the
store happens to hold. `attempts` in the day record counts **curations**, the
attempts that cost a model call; a publish that fails is retried on every later
run for the cost of one GET and one PUT, and is never abandoned.

### `src/cli.ts` — the shell

```ts
// usage: npm start -- run | ask <question>
```

---

## Module map

| File | Owns | Knows about |
|---|---|---|
| `src/types.ts` | The domain vocabulary | nothing |
| `src/config.ts` | Every environment variable and tunable | the environment, the config file |
| `src/session.ts` | The Harness, the model registry, the credential store, the agent | pi-durable, pi-ai |
| `src/source.ts` | The `feed` adapter, the RSS/Atom parser, lightpanda, URL canonicalization | the network, XML, the browser |
| `src/model.ts` | The two model calls, the JSON contract, the request ids | pi-durable's conversations, the model's output |
| `src/curate.ts` | The candidate table, the day's curation policy | `source.ts`, `model.ts` |
| `src/post.ts` | The post format: frontmatter, markdown, escaping | the digest, markdown |
| `src/publish.ts` | The published artifact | the GitHub Contents API |
| `src/day.ts` | The durable record of a date | pi-durable's document families |
| `src/lock.ts` | The run lock | the filesystem |
| `src/run.ts` | Which dates, when to retry, when to quarantine | `day.ts`, `curate.ts`, `post.ts`, `publish.ts`, `source.ts` |
| `src/cli.ts` | argv, exit code, printing | nothing |

One owner per piece of state: the day family (`day.ts`), the published artifact
(`publish.ts`), the post format (`post.ts`), the run lock (`lock.ts`).

Build side, outside the curator core and not designed here:
`contentlayer.config.ts` imports `FRONTMATTER_FIELDS` from `src/post.ts` and
declares the `Post` document type; `scripts/render.ts` renders one HTML
template per post plus the index from contentlayer's generated JSON, and the
Pages workflow uploads the result. The curator publishes
`content/<date>.md`; the build turns it into HTML.

---

## Synthesis decision

This is candidate B. The orchestrator records the base selection; this
candidate's position on the axes is the table at the top of *Shape*, and the
shape it defends is:

- one session-scoped family keyed by date, read only by keys the run holds, so
  no key index exists;
- a stage machine (`opened → scanned → curated`) instead of a bag of nullable
  fields, so the record's shape is a type, not a convention;
- two model calls instead of one, with the cheap one first;
- the candidate table in memory with only its identity half durable;
- no article-level seen-set at all, because the date is the unit of publication.

The grafts it expects to want from elsewhere: a cheaper way to read the feeds,
and a sharper answer for the "how many times was this date attempted" question.

---

## Tradeoffs accepted

- **We accept a second copy of the selected articles** — in the durable record
  and in the post — in exchange for re-publishing a date whose publish failed
  without re-running the model. The copy is small (six sources per date).
- **We accept that a date's candidate list is frozen at first discovery** in
  exchange for refs that stay valid across a crash. A day therefore publishes
  the articles we knew about when we first saw it, not the ones that turned up
  later. This looks like a stale-data bug; it is the price of a stable ref
  space.
- **We accept one extra model call per date** in exchange for roughly a third
  of the input tokens and a much simpler output shape. The selection call is
  over titles and openings; the write-up call is over the few bodies it chose.
- **We accept that the feed's own summary is not carried** in exchange for one
  fewer field on every candidate. A feed summary is either empty, a bare link,
  or the opening of the body the model is shown anyway.
- **We accept that the model's prose renders as plain text** (every markdown
  metacharacter escaped) in exchange for the guarantee that the post's links
  are exactly the ones the renderer wrote. A digest that wanted inline code
  or emphasis would have to render that itself, from structured data.
- **We accept that a date whose curation failed three times is abandoned** in
  exchange for a run that never retries forever. This looks like data loss;
  it is a bounded, visible gap in the archive, never a broken post.
- **We accept no article-level seen-set** in exchange for no second source of
  truth about what the reader has seen. A URL that two feeds date differently
  could be published twice.
- **We accept that the durable store keeps every day's candidates and digest**
  (about 10 kB a day, some 4 MB a year) in exchange for a day that is
  resumable and auditable.
- **We accept a per-date conversation per attempt** in exchange for contexts
  that cannot contaminate each other. The cost is a conversation row per
  attempt and a provider session per attempt, so provider-side prompt caching
  does not carry across days.

---

## Alternatives considered

**A single flat ledger document instead of a family.** One session-scoped
`defineDoc` holding `{ "2026-10-29": DayRecord, ... }`. It needs no key index
and enumerates for free. It loses because the whole history is rewritten on
every write, one document becomes the write hotspot and the corruption magnet,
and answering "what do I know about today?" costs loading every day we have
ever run. It also contradicts the settled constraint that a session-scoped
family is the intended home. Interface depth: it exposes the entire history to
answer a question about one date.

**The published artifact as the only state.** No durable day record at all:
publish state, attempt count and the model output all come from the artifact
and the transcript. It loses because a failed curation is invisible — the date
is retried forever, with no attempt budget — and because a date that was
curated but not published has nowhere to keep the digest, so the retry must
re-run the model and produce different bytes. It cannot answer "has this date
been attempted, and how many times", which the task asks for directly.

**A second family keyed by URL, owning the seen-set.** The explicit
"already handled" set, with the durable day record beside it. It loses on
split ownership: the seen-set and the day record are two writers for one
invariant, and they disagree exactly in the case the task names — a publish
that fails after the summaries were written would have marked the articles
handled, and the reader would never see them. It also needs a key index,
because the union of seen URLs spans every date and the family cannot be
enumerated. Interface depth: it exposes a second query surface for a question
the date already answers.

**A durable candidate table holding all thirty fetched bodies.** It keeps the
work of a crashed run. It loses because it stores the cheapest thing to
recompute (thirty seconds of lightpanda) and the most expensive thing to keep
(87 MB a year), while the part that is *not* recomputable — the model's choice
and prose — is already protected by the request id.

**One model call that both picks and writes.** One request, one output shape,
the model sees every body. It loses on cost (all thirty bodies in one prompt,
about 60 k input tokens against 12 k for two calls) and on reliability: the
model has to interleave selection and prose in a single answer, which is
precisely where model-authored links would creep back in.

---

## Open questions and risks

- Does `openai-codex` answer the JSON contract reliably enough? The tolerant
  extractor and the per-attempt retry are the fallback, but the worst case is
  a date abandoned after three attempts. Would a stricter contract (a schema
  in a tool call) be worth the machinery?
- The Contents API directory listing caps at 1000 files. At one post a day that
  is about two and a half years. What should the third year do — paginate the
  listing, or archive the content directory?
- The post date is the local date of an article's `pubDate`, and "today" is the
  Pi's local date. Should the publisher's date be a fixed time zone
  (`Asia/Hong_Kong`) rather than whatever the machine is set to?
- A date that was curated but whose publish failed is retried on every later
  run, at the cost of one GET and one PUT a day, and it is never abandoned.
  Is a bounded number of publish retries wanted instead?
- The RSS parser is hand-written for RSS 2.0 and Atom, with no new dependency.
  Which feeds must it cover, and does any of them need Atom's `<link href>`
  form or a namespace prefix?
- A day with no articles at all produces no post, and the reader sees a gap.
  Should such a day get a short "nothing worth reading" post instead?
- The operator's `ask` path keeps one long-lived root conversation. Should it
  be reset periodically, the way a curator day is?
- `lightpanda fetch --dump markdown` returns site navigation along with the
  article. Should the body extractor cut to the article element, and if so by
  which selector per outlet?

---

## Next implementation step

Write `src/day.ts` and its test first: open a Harness over a temp SQLite file,
advance one date through `opened → scanned → curated`, close, reopen, and
assert the record survived — the crash-safety story is the part of this sketch
with type-level evidence but no runtime evidence yet.
