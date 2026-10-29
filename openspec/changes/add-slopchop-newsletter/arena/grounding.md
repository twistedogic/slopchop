# Grounding for the slopchop curator design

Everything here was verified in this session by running code or reading the
installed packages. Treat it as fact.

## What exists today

`twistedogic/slopchop` does not exist on GitHub. Confirmed 404.

The local repo is four source files, 54 lines:

```
src/harness.ts   22 lines  opens Harness over SQLite, sets provider + model
src/cli.ts       24 lines  submit -> wait -> print -> exit
src/text.ts       7 lines  pull the text out of an assistant entry
src/index.ts      1 line   re-exports
test/smoke.test.ts 39 lines  one faux-provider turn, survives a reopen
```

`package.json` has no contentlayer. `tsconfig.json` includes only
`src/**/*.ts` and `test/**/*.ts`, with `strict`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`,
`noEmit`. Node >= 22.18, TypeScript runs directly with no build step.

`data/session.sqlite` holds two failed turns: one
`Provider is not configured: openai`, one
`OpenAI API error (403): unsupported_country_region_territory`. The developer
is in Hong Kong. `api.openai.com` does not serve Hong Kong.

## pi-ai facts

`Models` is the provider registry. `createModels()` returns a `MutableModels`
whose `setProvider(provider)` upserts by `provider.id`. `builtinModels()` from
`@earendil-works/pi-ai/providers/all` registers every built-in provider.

Credentials live behind a `CredentialStore` interface that the app implements.
pi-ai ships only `InMemoryCredentialStore`, and the interface comment says
"Apps inject persistent stores. Keyed by `Provider.id`, one credential per
provider." The methods are `read`, `list`, `modify`, `delete`. `modify` is the
only write path and is where OAuth refresh happens inside the store lock, so a
naive file store that does not implement `modify` semantics breaks refresh.

`models.getAuth(providerId)` resolves undefined when the provider is unknown
or unconfigured. That undefined is exactly the
`Provider is not configured: openai` error in the existing transcript.

`models.login(providerId, "api_key" | "oauth", interaction)` runs a
provider-owned login flow and persists the credential. The `AuthInteraction`
gives you `prompt({type:"text"|"secret"|"select", ...})` and `notify(event)`.

The `openai-codex` provider is OAuth only, baseUrl
`https://chatgpt.com/backend-api`, named "OpenAI Codex (legacy)" in pi-ai.
The `openai` provider supports both an API key and a ChatGPT OAuth, but posts
to `https://api.openai.com/v1`, which is the geo-blocked host.
`gpt-6-sol` exists in both catalogs.

pi-ai knows the environment variable for 36 providers. The ones that serve
Hong Kong include `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`.

## pi-durable facts

`HarnessOptions.models` accepts `Models | (() => Models)`, and the doc says the
function is "called at each use, so a host can replace its model configuration
without reopening the Harness".

`harness.root(ctx, { agent })` applies the `agent` option only when the root
conversation is created. `harness.js` returns the existing root before
reaching `configure(tx, record.id, options.agent)`. So an existing database
keeps whatever model it already stored, and `root.configure(change, ctx)` is
the way to change it.

`AgentState` is the stored per-conversation agent. It carries `model` as a
`ModelRef` of `{ provider, modelId }`, `thinkingLevel`, `instructions`,
`tools`, `modelTools`, `extensions`, and `cwd`. `instructions` is
"Rendered after every extension section, as the section `instructions`".

`root.submit({type:"input", content}, ctx)` returns a `Submission`.
`submission.wait(ctx)` resolves to a settled record whose status is `done` or
`unanswered`, and whose type is `input`. The raw provider error is in
`settled.detail`, not in `settled.reason`.

`root.commit((tx) => tx.entry(AssistantEntry, settled.answer), ctx)` commits
the answer as an entry. The existing CLI does this by hand after `wait`.

`root.entries({order:"ascending"}, limit, cursor, ctx)` returns a
`Page<EntryRecord, Cursor>`. `EntryQuery` is
`{conversationId, minEntryId, maxEntryId, order}`. There is no filter by
entry kind, so scanning for URLs inside entries means reading every entry and
string-matching.

`defineDoc` and `defineDocFamily` build typed durable documents. A family is
keyed: `defineDocFamily({kind, version, family: true, scope: "session",
initial: (seed) => T, checkpointWhen: (...) => boolean})`. Reads go through
`session.snapshot(token, key, ctx)`, `session.documentState(token, key, ctx)`
and `session.watchDoc(token, key, ctx)`. Writes go through
`tx.doc(token, key, seed)` inside a commit, which returns a `Draft<T>`.
`DocumentAddress` is `{kind, scope, key?}`. `DocumentQuery` is
`{scope, at, kind?}` and scans document incarnations alive in one scope.

`defineDoc` has scopes `session`, `conversation`, `task` and `rewindable`.
Session scope is the one that survives across separate `Harness.open()` calls
over the same storage.

`DEFAULT_RETRY_POLICY` is `{enabled: true, maxRetries: 3, baseDelayMs: 2000,
maxAgentDelayMs: 60000}`. `DEFAULT_COMPACTION_POLICY` is `{enabled: true,
reserveTokens: 16384, keepRecentTokens: 20000, backgroundTokens: 32768}`.
`DEFAULT_RESTART_LIMIT` is 5.

`HarnessOptions.onReport` is called for failures that do not fail the calling
operation, such as a throwing hook, a faulted task, and the error that fails
the Session, once.

`harness.usage(ctx)` returns the session total usage, every conversation's
`pi.usage` summed. `harness.inspect(ctx)` returns live tasks and unsettled
submissions, and writes nothing. `harness.wake()` returns whether a process is
needed now.

## contentlayer facts

`npx contentlayer build` works with no Next.js present. It exits 0 and writes
`.contentlayer/generated/Post/<file>.json` per document,
`.contentlayer/generated/Post/_index.json`, `.contentlayer/generated/index.mjs`
and `types.d.ts`. The JSON is plain and readable by any Node script.

`getFlattenedPath` strips the extension, so `content/2026-10-29.md` has
flattenedPath `2026-10-29` and basename `2026-10-29`. The slug falls out of
the filename with no extra handling.

`contentType: "markdown"` compiles through remark-frontmatter, remark-parse,
remark-rehype and rehype-stringify. The body field is `{raw, html}`. The
`markdown` config option also accepts a builder callback, which is where
extra rehype plugins would go.

Measured escaping behaviour, reproduced:

```
inline code  `Vec<T>`   ->  <code>Vec&#x3C;T></code>     renders as Vec<T>
fenced code  { braces } ->  <pre><code>... verbatim      correct
prose        a < b      ->  a &#x3C; b                   correct
prose        Vec<T>     ->  Vec                          the <T> vanished
prose        <div>      ->  gone                         vanished
script tag   <script>   ->  gone                         stripped, safe
link         [x](javascript:alert(3))
                         ->  <a href="javascript:alert(3)">x</a>   SURVIVES
link         [x](data:text/html;base64,...)
                         ->  <a href="data:...">x</a>             SURVIVES
image        ![b](https://tracker/x.png)                   SURVIVES
```

Raw HTML is dropped because rehype-raw is absent. Link destinations are not
protocol checked, because mdast-util-to-hast copies `node.url` verbatim. This
is the exact reason the post's links get rendered from a candidate table in
code rather than copied from model prose.

`contentlayer@0.3.4` is the last release and is not in `package.json`. It
pulls esbuild and mdx-bundler even for markdown content type.

## lightpanda facts

Version `1.0.0-nightly.8925+a7bda0ea5` on this machine. `lightpanda fetch
--dump markdown <url>` returned a full article in about 1.2 seconds. The
output includes site navigation chrome.

`lightpanda fetch --help` confirms these flags exist:

```
--block-private-networks    block requests to private and internal addresses
                            after DNS resolution. DEFAULTS TO FALSE
--terminate-ms              hard deadline for JavaScript. Defaults to no terminate
--wait-ms                   wait time. Defaults to 5000
--dump-max-bytes            soft cap on the dumped html or markdown. Off by default
--dump-selector             dump only the first element matching a CSS selector.
                            Fails when nothing matches
--strip-mode ui             in markdown, scripts and styles and hidden elements
                            are never rendered
--fail-on-http-error        fail on non-2xx
--json                      fetch many URLs in one process, returns per-URL
                            http_status and error
--cookie / --cookie-jar
```

`lightpanda fetch --dump markdown https://news.ycombinator.com/rss` returns an
EMPTY document. Lightpanda renders XML to nothing. RSS must come from a plain
HTTP fetch, never from lightpanda.

The official HN feed `https://news.ycombinator.com/rss` returns 30 items with
title, link, pubDate and a description that is only a link. `hnrss.org/frontpage`
returns 20. The HN Firebase API returns 500 ids for `newstories` and
`topstories`, 200 for `beststories`, each with title, url, score, time and a
stable id.

A release asset named `lightpanda-aarch64-linux` and an
`lightpanda_1.0.2_arm64.deb` both exist, so the Pi is viable.

## GitHub facts

The `gh` CLI is authenticated as `twistedogic` with token scopes `gist`,
`read:org`, `repo`, and git operations over SSH. `gh auth status` shows the
token in the OS keychain, which a Raspberry Pi does not have.

The GitHub Contents API requires `content` to be Base64 encoded. It returns
422 on validation failure. Updating an existing file also requires its `sha`.
`gh api --input file.json` sends a preconstructed JSON body.

The directory listing endpoint returns at most 1000 files.

`twistedogic/twistedogic.github.io` is a Next.js site served from `master`
with a GitHub Actions build. `twistedogic/eca` is a project Pages site served
from `main:/` at `https://twistedogic.github.io/eca/`. That is the shape a
project Pages site takes.

A branch-based Pages deployment serves the committed directory and runs no
build. A workflow-based deployment runs the build and uploads the artifact.

## Prior art

`twistedogic/curation` is a Zig HTTP server that curates RSS and Atom feeds
into incremental EPUBs, using `lightpanda fetch --dump markdown` for web
content and a local `pi` subprocess for classification. It is a good
reference for feed parsing and a warning about what happens when the artifact
is deferred. Its three documented defects: web items carry no date so they
never prune, a fresh system fails its first run because parent directories are
not created, and the scheduler is UTC while the spec says local time.

## pi-durable runtime flow, traced

Read from the installed dist. Paths are relative to
`node_modules/@earendil-works/pi-durable/dist/`.

### Admission

`root.submit(draft, ctx)` runs ONE commit, `admitSubmission`
(`harness/submissions.js:147-224`), whose rules in order are:

1. **Request-id idempotence** (lines 150-158). A `draft.requestId` that already
   identifies a submission returns that submission unchanged. A different
   `type` under the same requestId throws. This is the crash-safe
   "did I already do today's run" hook. `requestId: "post-2026-10-30"` is the
   shape.
2. **Display-only write shortcut** (lines 160-166). A `type: "write"` whose
   entry carries only `kind` and `data`, no `model` and no `head`, is appended
   immediately and settled done even while the conversation is busy. It
   changes nothing the model sees. This is how the app records its own state
   without waking the model.
3. **Busy detection** (line 167-168). `pi.live.run !== undefined` means busy.
4. **Queue** (lines 181-206). If busy, the submission is created `queued` and
   pushed into `pi.inbox`, mode `steer` or `followUp`. Placement at a boundary
   is `applyBoundary` (`harness/inbox.js:35-71`): writes first, then user
   items, in ID order.
5. **Idle input** (lines 219-223). The user entry is appended, the submission
   is created `placed`, and `startRun` begins a generation.

`submit()` implicitly calls `resume()` (line 37). Submitting always enables
scheduling.

### The generation task

`GenerationTask = defineTask({name: "pi.generation", version: 1, initial: () =>
({phase: "prepare", attempt: 1}), phases: {prepare, request, poll, tools,
retry}, abort})` (`harness/generation.js:22-220`).

The phase name is literally `task.state.checkpoint.phase`. A phase handler
**must commit durable progress or a terminal outcome**, or the task faults
(`harness/scheduler.js:1694-1698`).

`classify` (lines 372-452) treats `stopReason` of `stop`, `length` or
`toolUse` as success. On success, `answer()` (line 458) commits in ONE
transaction: `appendAssistant(tx, conversationId, message)` then
`endRun(...)` with the entry id. `appendAssistant` (lines 589-592) is the only
writer of the assistant entry, and it also records usage.

### What `root.commit((tx) => tx.entry(AssistantEntry, settled.answer), ctx)` is

**A read.** `Transaction.entry` (`session/transaction.js:69-76`) is a table
read. `settled.answer` is an **EntryId, not a message**. The generation task
already wrote the `pi.assistant` entry. The caller's commit re-reads it so the
caller gets the message object out of the Harness. If the caller never
re-reads, nothing is lost: the entry is in storage and the submission is
settled done with `answer` set. The existing `src/cli.ts:19` uses the
canonical form.

### Documents

`defineDocFamily({kind, version, family: true, scope, initial: (seed) => T,
checkpointWhen: (value, ops, info) => boolean})`.

- Address is `(kind, scope, key)`. `tx.doc(Family, "2026-10-30", seed)` for a
  session-scoped family.
- `tx.doc` creates if absent and returns a mutable `Draft<T>`. It memoises by
  address within a transaction, so there is no read-modify-write hazard.
  `session.snapshot(token, key, ctx)` is the read side and returns undefined
  for an absent member.
- **`initial(seed)` runs only when the member is absent.** The seed is not an
  upsert payload and is ignored on an existing member.
- **The seed argument is mandatory at runtime for a family.** Omitting it
  throws `Value contains a non-JSON undefined` from `copyJson`
  (`chord/dist/json.js:19-20`).
- `checkpointWhen` decides whether a change is stored as a complete base or a
  delta. Return true for bulk rewrites or the delta chain grows without bound.
  The built-ins: `pi.usage` always true, `pi.agent` always true, `pi.inbox`
  true only when the queue drains, `pi.live` true only when idle.
- **There is no public way to enumerate a family.** `Storage.scanDocuments`
  exists (`types.d.ts:1030`, query `{scope, at, kind?}`, ordered by id
  ascending) but it is **not** on Session, Tx, or Harness, and
  `harness.storage` is `protected` (`session/session.d.ts:48`). Reaching past
  the API boundary is not acceptable. **You must maintain your own key index.**
- Session scope means per **storage**, not per Harness instance. Two Harness
  objects over the same storage share session-scoped documents.
- Task-scoped documents are retired when the task goes terminal
  (`session/transaction.js:553-582`). A ledger that must outlive its task uses
  session or conversation scope.
- Changing a document's scope, history, or fork across versions is a hard
  error, not a migration (`documents.js:70-76`).
- Table reads must precede the first table write in a commit, or `ReadAfterWrite`
  fires (`errors.js:16-21`).

### Conversations

`harness.root(ctx, {agent})` **ignores `agent` and `init` when the root
already exists** (`harness/harness.js:261-263`, an early return before
`configure`). The existing `src/harness.ts:19` is affected: a changed
`PI_MODEL` does nothing after the first run.

`root.configure(change, ctx)` is a partial update. A given field replaces the
stored one, `null` clears it, `undefined` changes nothing. It is **idempotent**:
`pi.agent` uses `checkpointWhen: () => true` and "a document write of an equal
value records no change" (`harness/agent.js:92`), so the second identical call
writes nothing and the commit is discarded.

`harness.createConversation(options, ctx)` needs `ownership`, which is
`{kind: "ownerless"}` or `{kind: "task", taskId}`. A task-owned conversation is
aborted with its task and excluded from ordinary idle waits. Conversations
persist across `Harness.open()` calls, so create-per-day and read-back-by-id
works.

**`pi.provider` is per-conversation** (`harness/provider.js:4-12`), so a new
conversation gets a new provider session id and provider-side prompt caching
does not carry across conversations.

### Tasks and recovery

A phase re-runs **from its top** after a crash. There is no sleep in the middle
of a phase. Everything a phase needs must be in its checkpoint. On
`Harness.open()`, every surviving `running` task becomes `pending` with
`restarts + 1` (`harness/scheduler.js:195-201`).

`settings.restartLimit`, default 5, counts consecutive crash or eviction
restarts and parks the task at the limit. **A close is not counted**
(`harness/scheduler.js:328-345`).

`DEFAULT_RETRY_POLICY` `{enabled: true, maxRetries: 3, baseDelayMs: 2000,
maxAgentDelayMs: 60000}` is a **model-request** retry, applied in `classify`
(`harness/generation.js:422-429`), not a task retry. A context overflow is
never retried, only compacted.

Work in the middle of a phase is lost and redone, unless a tool declares
`replay: "safe"`. The publish step sits outside any task, so it must be
idempotent by other means.

**One process owns a storage at a time. There is no cross-process locking**
(`README.md:790`).

### Context and compaction

`conversation.reset(handoff, ctx)` admits a `pi.reset` entry with `head: "self"`,
a new head marker with no history. The model stops seeing the older entries,
which stay in storage. This is the fresh-context mechanism.

Compaction triggers on a threshold before the request
(`harness/generation.js:236-246`) and on a context overflow after a provider
error. It appends a `pi.compaction` entry whose `head` is the first kept entry.
Older entries stay in storage.

### Observability

`entry.model[0].usage.input` is the exact token count for one request. That is
the cheapest and most precise answer to "what did this call cost".

`settled.reason` is one of `model_error`, `no_model`, `aborted`, `faulted`,
`stale`, `reset`, `run_failed`, `orphaned`. `settled.detail` carries extra
JSON for `model_error`. **The raw provider error is in `detail`, not `reason`.**

`harness.inspect(ctx)` returns only `queued` and `placed` submissions
(`harness/harness.js:198`). **A failed submission does not appear in it.**

`HarnessOptions.onReport` receives `session_failed`, `task_faulted`,
`task_parked`, `migration_failed`, `task_outdated`, `task_error`,
`extension_error`, `host_error`, `listener_error`. It is the only surface that
sees task faults and session failures.

`harness.wake()` returns `{active, at?}` and answers when the session next
needs a running process. `harness.resume()` enables scheduling. For a daily
cron, `onWake` is not needed.
