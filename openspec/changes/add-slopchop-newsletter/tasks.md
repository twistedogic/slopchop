# Tasks

Each task states how it is verified. A task that cannot be verified is not finished. Every group ends in a gate that checks the real artifact.

## 1. Spikes

Each spike answers one question with a binary verdict and changes no product code. A spike that fails stops the run and reopens the design for that question.

- [ ] 1.1 Create `twistedogic/slopchop` as a public repository with a `main` branch, enable Pages with the source set to GitHub Actions, and add one hand-written post. Verify by fetching the post's url and asserting a 200 with the post's text and a resolvable stylesheet. Record the verdict. This spike settles the branch, the Pages mode, the url shape and the asset prefix in one move.
- [ ] 1.2 Authenticate against the `openai-codex` provider from this machine and make one completion that ends with the stop reason `stop`. Verify by asserting the stop reason and recording the token counts the entry carries. If this fails, record which providers do work from here and change the default before anything else is built.
- [ ] 1.3 Install the pinned lightpanda release on the target Linux machine and fetch one real article with the private-network block, a hard deadline and an output cap in force. Verify by asserting markdown came back and that the flags appear in the command line the process was given.
- [ ] 1.4 Feed contentlayer a post containing a `javascript:` link, a `data:` link, a url with a closing parenthesis, a fenced code block with braces and a bare angle-bracket type name. Verify by asserting the produced HTML holds no disallowed scheme, that the parenthesis is inside the destination, and that the code block kept its braces.

## 2. Scaffold

- [ ] 2.1 Add `contentlayer` to `devDependencies` at an exact version, a `build` script and a `prove` script, widen `tsconfig.json` to cover the new directories, and gitignore the generated content directory. Verify by running the build script against a fixture post and asserting the expected files exist.
- [ ] 2.2 Write the domain vocabulary: a branded date, a branded http url and a branded plain text, each with one boundary constructor that rejects what it must reject. Verify with a test that a javascript url, a url with credentials, a non-date string and a title carrying markdown metacharacters are each rejected or stripped as the type promises.
- [ ] 2.3 Define the per-date document family and its read and write functions, using a null for an artifact that does not exist yet. Verify by writing a record, closing the storage, opening it again and asserting the record reads back unchanged.

## 3. The spine

- [ ] 3.1 Write the build script and the single template and stylesheet, so that each dated post becomes a directory with an index file and the archive lists them newest first. Verify by asserting the generated files exist and contain the post's body and a link to the stylesheet.
- [ ] 3.2 Write the workflow that runs the pinned build and deploys the artifact, on the same branch the publisher writes to. Verify by pushing a post and confirming the deployment ran and the url serves the post.
- [ ] 3.3 Write the publisher against the Contents API, encoding the content as Base64, never overwriting, and treating an existing file with identical bytes as success. Verify by a test that decodes the request body and compares it byte for byte with the source, and by a test that an existing file with different bytes is reported as a conflict and left alone.
- [ ] 3.4 Read publish state back from the published artifact, the dates through a mechanism that does not truncate, and the covered urls from the published posts. Verify by asserting that a date present in the repository reads as published and its urls read as covered.
- [ ] 3.5 GATE. Publish a hand-written post end to end and assert the post is reachable at its url with the stylesheet loaded. Nothing else in this change is built until this passes.

## 4. The curator

- [ ] 4.1 Write the feed adapter: plain HTTP, a tolerant RSS and Atom reader, canonical urls, date bucketing in the configured timezone. Verify against checked-in fixtures, including one that fails to parse and one with a duplicate url.
- [ ] 4.2 Write the body fetch adapter: the subprocess argument array, the private-network block, the hard deadline, the output cap, the concurrency bound, and a minimal child environment. Verify against a local server that a private address is refused, that a hanging page is killed at the deadline, and that the child environment holds neither the provider credential nor the GitHub token.
- [ ] 4.3 Write the model adapter: the two calls, their request identifiers, the reference-only answer shape, and a tolerant parser. Verify with the faux provider that a reference to an unknown candidate is dropped, that a truncated answer is rejected, and that a resubmitted identifier does not issue a second call.
- [ ] 4.4 Write the day pipeline: discover, fetch, select, compose, and the writes that record each stage. Verify with the faux provider and a fixture feed that a date whose body fetch fails still produces a digest over the remaining candidates, and that a date whose model answer is truncated fails with a named cause and writes nothing.
- [ ] 4.5 Write the renderer: the application-written frontmatter, links drawn from the candidate table with angle-bracket destinations, escaped prose, and stripped feed titles. Verify by asserting the rendered bytes contain no url whose scheme is not http or https, and that a candidate url with a closing parenthesis keeps that parenthesis inside the destination.
- [ ] 4.6 GATE. The whole suite passes with no network and no provider credential.

## 5. The run

- [ ] 5.1 Write the run lock: an exclusive file beside the database carrying the owning process id, with a dead owner's lock taken over. Verify by holding the lock in one process and asserting a second process reports the lock as held, and by writing a lock naming a dead process and asserting it is taken over.
- [ ] 5.2 Write the run policy: the dates to publish, the attempt budget, the quarantine, and the report that distinguishes published, skipped and failed. Verify by a test where one date fails and two publish, and by a test that a date at the attempt limit is abandoned and costs no further model call.
- [ ] 5.3 Write the provider readiness check, before any feed is fetched. Verify by pointing the run at a provider with no credential and asserting it exits with a named cause, fetches nothing and makes no model call.
- [ ] 5.4 GATE. On the target machine, one run publishes one post that is reachable at its url, and a second run publishes nothing and spends nothing.

## 6. Hand back

- [ ] 6.1 Write the README: the setup, the configuration, the one-time credential step, the deployment, and how to read the run report. Verify by following it on a clean checkout until the run reports a published date.
- [ ] 6.2 Commit the decision trail with a row per decision, each pointing at evidence that resolves. Verify by checking every evidence pointer resolves.
- [ ] 6.3 GATE. The predicate holds on two consecutive runs, and the published archive shows one post per day with no gap that the run report does not explain.
