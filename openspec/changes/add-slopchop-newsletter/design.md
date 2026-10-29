# Design

## Context

See proposal.md for the motivation. This section records only the constraints that shape the approach.

Four facts about the libraries decide the shape. All four were verified by reading the installed packages or by running them.

1. `harness.root(ctx, { agent })` applies its `agent` option only when the root conversation is created. `harness/harness.js:261-263` returns the existing root before reaching `configure`. The repository's `src/harness.ts:19` therefore does not do what it looks like it does, and a changed provider takes effect never. The run must configure the conversation explicitly on every start.
2. There is no public way to enumerate a document family. `Storage.scanDocuments` exists but is not on `Session`, `Tx`, or `Harness`, and `harness.storage` is protected. Any design that needs to list family members owns a key index, or avoids needing one.
3. `submit` accepts a `requestId` that is idempotent within a conversation. It is the only crash-safe "did I already do this" hook. `settled.answer` is an entry id, not a message, so the caller reads the entry back to get the text.
4. One process owns a storage at a time. There is no cross-process locking.

Two facts about the web decide the rest.

5. Lightpanda renders XML to an empty document. A feed cannot be read through it. A feed is fetched over plain HTTP and parsed.
6. contentlayer's markdown pipeline drops raw HTML but does not check link schemes. `[x](javascript:alert(3))` survives as a live link, and a destination written as `(url)` is truncated at the first `)`, which lets a feed-controlled URL inject visible text after the link. Both were reproduced against contentlayer 0.3.4.

Two constraints come from the product, not the libraries. The machine runs in Hong Kong and the OpenAI API does not serve it. And the run is unattended, so a failure must explain itself without anyone watching.

## Goals / Non-Goals

**Goals:**

- One dated post published per day, unattended, at a URL the reader can open.
- A crash never costs the same model call twice, and never publishes a partial post.
- The model's output cannot introduce a URL, a link, or a title that the app did not choose.
- Every stage is assertable without a network and without a provider credential.

**Non-Goals:**

- A second source kind. The first version reads feeds and nothing else.
- Historical backfill. The feeds cannot supply it, and a wrong-dated post is worse than a gap.
- Streaming. A post is a file.
- Any second reader, any authentication on the site, any high-availability story.
- A news-versus-knowledge classification. The selection step subsumes it.

## Decisions

### The state model: one date-keyed document family, and nothing else

**Chosen.** A single session-scoped document family keyed by date. Its member holds the attempt number, the candidate list, the model's choices, the model's prose, and the last failure. The stage is derived from which of those fields are present rather than stored as its own field.

**Why.** The design needs two answers. "What do I know about this date, and how many attempts has it had" is one keyed read. "Which urls have I already published" is answered by reading the published posts. Both are O(1) reads against a key the run already holds. The family is never enumerated, so fact 2 above never bites.

**Alternative considered.** A family keyed by url owning the seen-set, beside the date record. It loses on split ownership. The seen-set and the date record would be two writers for one fact, and they disagree in exactly the case that matters: a publish that fails after the summaries were written would have marked the articles handled, and the reader would never see them. It also needs a key index, because the union of seen urls spans every date and the family cannot be enumerated.

**Alternative considered.** One flat ledger document holding every date as a field. It enumerates for free, but the whole history is rewritten on every write, one document becomes the write hotspot, and answering a question about one date costs loading every day ever run.

### The seen-set belongs to the published artifact

**Chosen.** The site read returns the published dates and the urls covered by the published posts inside a bounded coverage window. Nothing local records "published" or "covered".

**Why.** This makes the publish-fails-after-the-summaries case correct with no second mechanism. When a publish fails the date is not published, so its urls are not covered, so the next run republishes exactly the stored bytes. Only a successful publish moves the date into the covered set. There is no window in which the work is marked done but the site does not have it, because the marking is the site. It also means the database can be lost and deduplication still works.

**Cost, accepted.** A url that resurfaces after the coverage window is treated as new. For a news digest that is the right default. A story that comes back around is news again, and it is the price of never growing a local ledger of every url ever published.

### Two model calls, and the model answers with references

**Chosen.** Selection runs over titles, sources, dates, urls and the first part of each body, and answers with the indices of the articles worth reading. Composition runs over the full bodies of only those articles and answers with a section per chosen article. The model never emits a url or a title.

**Why.** The token budget and the trust boundary both demand it. One call would carry every body, about 45k input tokens against roughly 20k for the split, and would ask one model to rank and write in the same answer. The split also puts the untrusted text after the instruction, inside labelled blocks, in a call that has no other job.

**Alternative considered.** One call that both picks and writes. Simpler to describe and one less place for the untrusted text to sit. It costs about twice the input tokens, asks one model to make two different kinds of judgement, and puts the compose step in a context that carries the selection step.

**Alternative considered.** The selection call asks for a summary and a reason alongside each pick. It reads better in the transcript, but it makes the model produce prose it will later be judged on, and a summary written at selection time is a summary written before the model has seen why the article matters.

### The renderer owns every link

**Chosen.** The model answers with indices. The app resolves an index to a candidate, and the candidate's url is the only thing that can become a link. Link destinations are written inside angle brackets, so a url containing a closing parenthesis cannot terminate the destination early. Model prose is escaped. Feed titles are stripped of markdown metacharacters and control characters before they are ever stored.

**Why.** Fact 6 above is two separate holes. The scheme hole is fixed by the app choosing every destination from a validated candidate, so the only scheme present is the one the feed adapter minted. The parenthesis hole is fixed by the destination form.

**Alternative considered.** A blacklist sanitizer over the model's markdown output. It is a list of things to remember, and a list of things to remember is a list that gets forgotten. The structural rule has no list.

### A day is its own conversation, and an attempt is its own conversation

**Chosen.** Each attempt gets a fresh conversation, created with the same agent configuration the root gets. The conversation id is stored in the date record.

**Why.** A day's model context cannot then contain another day's bodies, a previous failed attempt, or an operator's question. The provider session is per conversation, so each attempt also gets its own provider-side session and no prompt caching leaks between days.

**Cost, accepted.** A conversation row per attempt and a provider session per attempt. Provider-side prompt caching does not carry across days.

### The request id carries the attempt, and the failure field ends the attempt

**Chosen.** The two model calls carry request ids of the form `slopchop/<date>/<attempt>/<stage>`. The date record's `failure` field is both the last error and the marker that the last attempt ended. While it is null the next run resumes the same attempt with the same request ids, so a crash costs nothing. A recorded failure starts a new attempt number and therefore new request ids, so a genuine failure is paid for again rather than retried forever against the same broken input.

**Why.** Fact 3 above gives the idempotence; this gives it a meaning. The attempt number is the one thing that separates "the process died" from "the model was wrong".

**Alternative considered.** A conversation per date with a fixed request id per stage. It works, but the request id then has to be unique across attempts, and a date that failed once would keep failing against the same id.

### The curate and publish boundary is a value

**Chosen.** `curateDay` returns a `Digest`. A pure `renderPost(digest)` turns the digest into the published bytes. A separate publisher puts the bytes on the site. Three boundaries, each assertable alone.

**Why.** The curate half is testable with fixtures, a faux provider and lambda ports. The render half is testable with no inputs beyond a digest. The publish half is testable against a fake site. A test can assert the exact bytes of the post, and separately assert that an existing post is never overwritten.

**Alternative considered.** Curate and publish in one module that owns the whole day. One place to read, and the publish can see the whole day's work. It loses on testing. The curate half cannot be asserted without the site, and the publish half cannot be asserted without the model.

### Bodies are never stored

**Chosen.** The thirty bodies live in memory for the length of one attempt and are fetched again on demand.

**Why.** They are the cheapest thing to recompute. Thirty fetches cost about thirty-six seconds. Storing them costs roughly 240 kB a day and 88 MB a year, and buys nothing the durable record does not already hold, because the record keeps the decisions and the output, which are what a retry cannot afford to recompute. The model calls are protected by the request id instead.

### The site is one branch, one workflow, and one encoding

**Chosen.** One branch, `main`, for the publisher, the state query, and the Pages workflow. The Pages source is GitHub Actions. The workflow runs the pinned build and uploads the artifact. The publisher writes through the Contents API with the file content Base64 encoded, and treats an existing file whose bytes match as success.

**Why.** Three separate failures come from getting this wrong, and all three are silent. A publisher writing to one branch while Pages reads another publishes nothing. A branch-based Pages deployment serves the committed directory and runs no build, so committing content changes nothing on the site. And the Contents API rejects plaintext content, so the first publish fails with a validation error that says nothing about encoding.

**Alternative considered.** Committing the built `dist/` and letting Pages serve it from a branch. One fewer moving part, but the built output lands in the repository and the publisher has to write two trees per post.

### The coverage window bounds both the dates and the seen-set

**Chosen.** The dates to publish are the last N days that the feeds cover, minus the published ones. The seen-set is the urls covered by the published posts inside that window. N is three days.

**Why.** The feeds carry a rolling window of recent items. A date beyond that window has no candidates, and a url covered more than N days ago is old news. One bound serves both.

### The run holds a lock, and the lock is recognisably stale

**Chosen.** An exclusive lock file beside the database, carrying the owning process id. A lock whose owner is gone is taken over.

**Why.** The GitHub branch is a genuine single write target, so this is the case where serialising is the right answer rather than a smell. The Pi has no keychain and no systemd path guarantees that a timer never overlaps a manual run, and a second run over the same database is unsafe per fact 4.

### A model port in the dependencies

**Chosen.** The run takes its model through the dependency set, so a test can supply the faux provider.

**Why.** Without it the one test that would prove the whole product needs a real credential, which is the test nobody runs before a 4am failure.

### A quiet day publishes nothing

**Chosen.** A date with no candidates, or with nothing worth reading, is skipped. No file is written for it, and the run reports it as skipped rather than failed.

**Why.** A post that says nothing is clutter on a reader's archive, and the archive's shape is part of what the reader trusts. A gap reads as "nothing happened that day", which is what happened.

**Cost, accepted.** A gap and a failure look the same from the public archive. The distinction lives in the run's report, which is the operator's view. If the owner wants the public archive to distinguish them too, the change is one branch in the renderer that writes a short file for a skipped date, and one requirement in the publisher spec.

## Risks / Trade-offs

- **The Contents API directory listing returns at most 1000 files.** At one post a day that is about two and a half years. After that the listing truncates, older dates look unpublished, and the run tries to republish them. Mitigation: the publisher reads the published dates through the git tree API, which has no such cap, from the start. It costs one endpoint.
- **The provider is untested from Hong Kong.** If `openai-codex` cannot authenticate there, every date fails at selection and the run says so on every line, but the site's archive shows a quiet gap. Mitigation: the run checks provider availability before discovery and fails with a named cause, so the log says "provider not configured" rather than "selection failed".
- **A quiet day publishes nothing and the reader sees a gap.** A gap and a failure look the same from the archive. Mitigation: the run's report distinguishes skipped from failed, and the report is the operator's view. A quiet day is a deliberate skip, not a failure, and the two are named differently there.
- **The date arithmetic steps in fixed 24-hour increments.** Hong Kong has no daylight saving, so this is correct here and wrong for a zone that has one. Mitigation: the timezone is configuration, not a constant.
- **The database grows about 25 MB a year** from the model transcripts and the date records. On a Pi's card that is survivable for years. Mitigation: none yet. Accepted.
- **The model answers with a JSON contract and a provider might not honour it.** Mitigation: the parser is tolerant of surrounding prose, and a date that cannot be parsed is failed loudly rather than published half-formed.
- **A date that fails three times is abandoned.** The reader sees a permanent gap for that date. Mitigation: the attempt count and the last error are in the date record and in the run's report, so the gap is explained rather than mysterious.

## Migration Plan

Nothing to migrate. The repository holds a demo and a stale SQLite file.

The existing `data/session.sqlite` carries a conversation configured for a provider that cannot serve this machine. The run applies its own configuration to the conversation on every start, so the stale record is overwritten rather than trusted. The file can be deleted without consequence once the run has created its own.

Rollback is deleting the repository and the database. The only external side effect is a file written per day to a public repository, and a post that is published is never overwritten.

## Open Questions

- The selection call's excerpt length. The current figure is a guess and the token cost of that call scales with it.
- Whether the fetch should cut to the article element per outlet rather than taking the whole page and stripping navigation.
