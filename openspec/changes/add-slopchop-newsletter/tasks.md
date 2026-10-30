# Tasks

Each task states how it is verified. A task that cannot be verified is not finished. Every group ends in a gate that checks the real artifact.

## 1. Spikes

Each spike answers one question with a binary verdict and changes no product code. A spike that fails stops the run and reopens the design for that question.

- [x] 1.1 Create `twistedogic/slopchop` as a public repository with a `main` branch, enable Pages with the source set to GitHub Actions, and hand-write both a content file and a built index file into it. Verify by fetching the post's url and asserting a 200 with the post's text and a resolvable stylesheet. This spike settles the branch, the Pages mode, the url shape and the asset prefix in one move, before any build script exists.
- [x] 1.2 Authenticate against the `openai-codex` provider from this machine and make one completion that ends with the stop reason `stop`. Verify by asserting the stop reason and recording the token counts the entry carries. If this fails, record which providers do work from here and change the default before anything else is built.
- [x] 1.3 Install the pinned lightpanda release on the target Linux machine and fetch one real article with the private-network block, a hard deadline and an output cap in force. Verify by asserting markdown came back and that the flags appear in the command line the process was given.
- [x] 1.4 Run the committed reproduction at `openspec/changes/add-slopchop-newsletter/arena/repro/` and assert that it produces the committed `expected.html`. Then assert that contentlayer preserves a `javascript:` and a `data:` link destination, truncates a url written as a plain destination at its first closing parenthesis, and keeps a url written as an angle bracket destination whole. These are the measured behaviours the renderer has to defend against. Verify by diffing the produced html against the committed expectation.

## 2. Scaffold

- [x] 2.1 Add `contentlayer` to `devDependencies` at an exact version, a `build` script and a `prove` script, widen `tsconfig.json` to cover the new directories, and gitignore the generated content directory. Verify by running the build script against a fixture post and asserting the expected files exist.
- [x] 2.2 Write the domain vocabulary: a branded date, a branded http url and a branded plain text, each with one boundary constructor that rejects what it must reject. Verify with a test that a javascript url, a url with credentials, a non-date string and a title carrying markdown metacharacters are each rejected or stripped as the type promises.
- [x] 2.3 Define the per-date document family and its read and write functions, using a null for an artifact that does not exist yet. Verify by writing a record, closing the storage, opening it again and asserting the record reads back unchanged, that the record holds no field asserting the date was published, and that it holds no separate field naming how far the date got.
- [x] 2.4 Replace the provider and model handling in `src/harness.ts` so that the run configures the conversation explicitly on every start rather than passing the agent to `harness.root`, which silently ignores it when the root already exists. Verify by opening a database whose root already holds a different provider, starting the run, and asserting the conversation's stored provider and model are the configured ones afterwards.

## 3. The spine

- [x] 3.1 Write the build script and the single template and stylesheet, so that each dated post becomes a directory with an index file and the archive lists them newest first. Verify by asserting the generated files exist and contain the post's body and a link to the stylesheet.
- [x] 3.2 Write the workflow that runs the pinned build and deploys the artifact, on the same branch the publisher writes to. Verify by pushing a post and confirming the deployment ran and the url serves the post.
- [x] 3.3 Write the publisher against the Contents API, encoding the content as Base64, never overwriting, and treating an existing file with identical bytes as success. Verify by a test that decodes the request body and compares it byte for byte with the source, and by a test that an existing file with different bytes is reported as a conflict and left alone.
- [x] 3.4 Read publish state back from the published artifact. Resolve the content directory's tree from the branch tree, list that subtree on its own, and take the published dates and the covered urls from it. Verify by asserting a date present in the repository reads as published and its urls read as covered, that a truncated listing is refused with a named cause and publishes nothing, and that no durable record anywhere asserts that a date was published.
- [x] 3.5 GATE. Publish a hand-written post end to end and assert the post is reachable at its url with the stylesheet loaded. Nothing else in this change is built until this passes.

## 4. The curator

- [x] 4.1 Write the feed adapter: plain HTTP, a tolerant RSS and Atom reader, canonical urls, date bucketing in the configured timezone. Verify against checked-in fixtures, including one that fails to parse, one with a duplicate url, and one feed that fails while the others succeed.
- [x] 4.2 Write the body fetch adapter: the subprocess argument array with no shell, the private-network block, the hard deadline, the output cap, the concurrency bound, and a minimal child environment. Verify against a local server that a private address is refused, that a hanging page is killed at the deadline, that the dumped body respects the output cap, and that the child environment holds neither the provider credential nor the GitHub token.
- [x] 4.3 Write the model adapter: the two calls, the request identifiers that carry the date, the attempt number and the stage, the reference-only answer shape, and a tolerant parser. Verify with the faux provider that a reference to an unknown candidate is dropped, that a truncated answer is rejected, that resubmitting an identifier under an attempt with no recorded failure issues no second model call, and that a recorded failure produces new identifiers under a new attempt number.
- [x] 4.4 Write the day pipeline: discover, fetch, select, compose, and the writes that record each stage. Each attempt gets its own conversation, created with the same agent configuration as every other attempt. Verify with the faux provider and a fixture feed that a date whose body fetch fails still produces a digest over the remaining candidates, that a date whose model answer is truncated fails with a named cause and writes nothing, that a date whose answer carries fewer sections than the selection requires fails with a named cause, and that a date with no sections at all fails with a named cause.
- [x] 4.5 Write the renderer: the application-written frontmatter, links drawn from the candidate table with angle-bracket destinations, escaped prose, and stripped feed titles. Verify by asserting the rendered bytes contain no url whose scheme is not http or https, that a candidate url with a closing parenthesis keeps that parenthesis inside the destination, that an http url appearing in the model's prose does not become a link, and that the frontmatter carries values the application derived rather than values the model returned.
- [x] 4.6 GATE. The whole suite passes with no network and no provider credential.

## 5. The run

- [x] 5.1 Write the run lock: an exclusive file beside the database carrying the owning process id, with a dead owner's lock taken over. Verify by holding the lock in one process and asserting a second process reports the lock as held, and by writing a lock naming a dead process and asserting it is taken over.
- [x] 5.2 Write the run policy: the dates to publish, the attempt budget, the quarantine, and the report that distinguishes published, skipped and failed. The dates are the days inside the configured coverage window that the feeds cover, minus the published ones, minus the current date, oldest first. Verify by a test where one date fails and two publish, by a test that the current date is never published, by a test that the order is oldest first, by a test that a date beyond the coverage window is never attempted, and by a test that a date at the attempt limit is abandoned and costs no further model call.
- [x] 5.3 Write the provider readiness check, before any feed is fetched. Verify by pointing the run at a provider with no credential and asserting it exits with a named cause, fetches nothing and makes no model call.
- [x] 5.4 GATE. On the target machine, one run publishes one post that is reachable at its url, and a second run publishes nothing and spends nothing.

## 6. Hand back

- [x] 6.1 Write the README: the setup, the configuration, the one-time credential step, the deployment, and how to read the run report. Verify by following it on a clean checkout until the run reports a published date.
- [x] 6.2 Keep a durable record of every run's report, so that a gap in the archive can be explained later. Verify by asserting the record for a failed date survives a restart and still names the date and its cause.
- [x] 6.3 Commit the decision trail with a row per decision, each pointing at evidence that resolves. Verify by checking every evidence pointer resolves.
- [x] 6.4 GATE. The predicate holds on two consecutive runs, and the published archive shows one post per day with no gap that the run report does not explain.
