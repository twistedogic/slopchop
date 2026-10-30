# Spec Delta

## Purpose

The publisher turns a digest into a published post. It renders the file, writes it to the GitHub repository, reads publish state back from the published artifact, and runs the day's dates in order with a bounded attempt budget and an exclusive lock.

## ADDED Requirements

### Requirement: Post rendering

The system SHALL write the frontmatter of a post itself, using the date, a title and a description it derives from the digest, and SHALL NOT take them from the model. It SHALL render every link in the post from a candidate the application selected, and SHALL NOT render a link from model output. Every link destination SHALL be an http or https url, written inside angle brackets so that a closing parenthesis in the url cannot end the destination early. Model prose SHALL be escaped so that markdown metacharacters in it are shown rather than interpreted. A title taken from a feed SHALL have markdown metacharacters and control characters removed before it is stored. The rendered file SHALL contain no url whose scheme is not http or https.

#### Scenario: the file contains only links the app chose

- **WHEN** a digest is rendered
- **THEN** every link in the file points at a candidate the application selected, and no link comes from the model's text

#### Scenario: a url containing a closing parenthesis survives intact

- **WHEN** a candidate's url contains a closing parenthesis
- **THEN** the rendered link's destination contains that parenthesis, and the text after the link is not part of the destination

#### Scenario: a non-http scheme cannot reach the file

- **WHEN** a feed item's url carries a scheme other than http or https
- **THEN** the candidate is rejected before rendering and no link for it appears in the file

#### Scenario: the frontmatter comes from the application

- **WHEN** a digest is rendered into a file
- **THEN** the file's frontmatter carries a date, a title and a description that the application derived, and none of them came from the model's answer

### Requirement: Publication through the Contents API

The system SHALL publish a post by writing one file into the content directory of the configured repository, on the configured branch, through the GitHub Contents API. It SHALL encode the file's bytes as Base64 in the request body. It SHALL never overwrite an existing post. When a post already exists with bytes identical to the ones the run produced, the system SHALL treat the publish as successful and change nothing. When a post already exists with different bytes, the system SHALL report a conflict and SHALL NOT overwrite it.

#### Scenario: the first publish succeeds

- **WHEN** the system publishes a date whose file does not exist yet
- **THEN** the file is created on the branch with the digest's bytes, and the publish is reported as successful

#### Scenario: publishing the same digest twice converges

- **WHEN** the system publishes a date whose file already exists with bytes identical to the ones it produced
- **THEN** the publish is reported as successful, the file is unchanged, and the reader's page does not move

#### Scenario: a different digest for a published date is a conflict

- **WHEN** the system publishes a date whose file already exists with different bytes
- **THEN** the system reports a conflict, leaves the file untouched, and does not report the date as published

#### Scenario: the content is encoded as Base64

- **WHEN** the system builds the request that publishes a post
- **THEN** the request body carries the file's bytes as a Base64 string, and decoding that string reproduces the file byte for byte

### Requirement: Publish state comes from the published artifact

The system SHALL determine which dates are published by reading the published repository, and SHALL NOT keep a local record of what it has published. It SHALL determine which urls are covered by reading the published posts. It SHALL read the list of published files through a mechanism that does not truncate at a fixed number of entries, so that the state stays complete as the archive grows.

#### Scenario: the published set grows without truncating

- **WHEN** the repository holds more published files than a single directory listing returns
- **THEN** the system still reports every earlier date as published, and does not try to publish it again

#### Scenario: a truncated listing is refused

- **WHEN** the mechanism that lists the published files reports that its answer was truncated
- **THEN** the system refuses to act on that answer, reports a named cause, and publishes nothing for that run

#### Scenario: nothing local records what was published

- **WHEN** the system's durable store is inspected
- **THEN** no record asserts that any date was published

### Requirement: Run date selection

The system SHALL publish, for each run, every date inside a configured coverage window that the feeds cover, that is not already published, and that is not the current date, oldest first. The coverage window SHALL bound both the dates considered and the urls treated as covered. The system SHALL NOT attempt to publish a date the feeds cannot supply articles for, because the sources do not carry history.

#### Scenario: a covered date is published once

- **WHEN** the feeds cover three dates inside the coverage window and two of them are already published
- **THEN** the system attempts the one unpublished date, and does not attempt the two published ones

#### Scenario: the current date is not published

- **WHEN** the feeds carry items dated today
- **THEN** the system does not attempt to publish today's date, because the day is not finished

### Requirement: Bounded attempts and quarantine

The system SHALL count each attempt that costs a model call against a fixed limit. When a date reaches that limit, the system SHALL stop attempting it, record that it was abandoned, and continue with the remaining dates. The system SHALL NOT publish a partial post for any date. The run's report SHALL distinguish a date that was skipped, a date that was published, and a date that failed.

#### Scenario: one date fails and the others still publish

- **WHEN** one date fails during curation and two others are ready
- **THEN** the failed date is reported as failed, the other two are published, and the run does not abort

#### Scenario: a permanently failing date is abandoned

- **WHEN** a date has reached the attempt limit and still fails
- **THEN** the system stops attempting it, reports it as abandoned with its last error, and does not spend a model call on it again

#### Scenario: no partial post is published

- **WHEN** a date fails after its candidates were discovered but before its prose was composed
- **THEN** no file for that date exists in the repository

### Requirement: Run locking

The system SHALL hold an exclusive lock for the whole run. The lock SHALL record the identity of the owning process. A lock whose owning process is no longer running SHALL be taken over rather than blocking the run forever. When the lock cannot be taken, the system SHALL report that another run holds it and SHALL exit without publishing.

#### Scenario: a second run does not overlap the first

- **WHEN** a run starts while another run holds the lock
- **THEN** the second run reports that the lock is held and exits without publishing anything

#### Scenario: a lock left by a dead process is taken over

- **WHEN** the lock file names a process that is no longer running
- **THEN** the system takes the lock over and proceeds

### Requirement: Site build and deployment

The system SHALL build the site from the published content on one branch, and that branch SHALL be the same branch the publisher writes to and the same branch the publish-state query reads. The build SHALL be run by a workflow, not by a branch deployment, so that the built output is produced from the committed content. The published post SHALL be reachable at a url whose last segment is the date, and the stylesheet the site references SHALL resolve at that url.

#### Scenario: a published post is reachable

- **WHEN** a post for a date has been published and the deployment has run
- **THEN** the url for that date returns the post's content, and the stylesheet it references loads

#### Scenario: the branch is the same everywhere

- **WHEN** the publisher writes, the publish-state query reads, and the build runs
- **THEN** all three name the same branch, so a published post is visible to the state query and to the build

### Requirement: A repeated run publishes nothing

The system SHALL converge. Running it twice on the same date SHALL publish nothing the second time, spend no model call the second time, and leave the published artifact unchanged.

#### Scenario: the second run is a no-op

- **WHEN** the system runs twice in a row with no change to the feeds
- **THEN** the second run publishes no file, makes no model call, and reports the date as already published

### Requirement: Provider readiness is checked before any work

The system SHALL verify, before it discovers anything, that the configured provider and model are available and that credentials for that provider resolve. When they do not, the system SHALL exit with a named cause and SHALL NOT fetch a feed, and SHALL NOT start a model call.

#### Scenario: an unconfigured provider fails before discovery

- **WHEN** the configured provider has no resolvable credential
- **THEN** the system exits with a named cause, fetches no feed, and makes no model call
