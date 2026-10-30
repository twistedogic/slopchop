# slopchop-curator Specification

## Purpose
The curator turns configured feeds into one curated digest per date. It discovers articles, fetches their bodies under a fixed sandbox policy, asks a model which are worth reading and to write them up, and keeps a durable per-date record so a crashed run resumes without paying for the same work twice.

## Requirements

### Requirement: Feed discovery

The system SHALL read every configured feed over plain HTTP and SHALL NOT render a feed through a browser. It SHALL accept both RSS 2.0 and Atom documents, tolerantly. It SHALL extract, for each item, a title, a URL, a publication timestamp and a source name, and SHALL assign the item to a date bucket derived from that timestamp in the configured timezone. It SHALL deduplicate items that carry the same canonical URL, where canonical means lowercased scheme and host, no fragment, and no tracking parameters, and SHALL keep the first occurrence. A feed that fails to fetch, times out, or cannot be parsed SHALL be reported as failed and SHALL NOT stop the other feeds.

#### Scenario: an RSS feed yields dated candidates

- **WHEN** the system reads an RSS 2.0 feed containing two items with a title, a link, a description and a pubDate
- **THEN** it yields two candidates whose titles, urls and sources come from those elements and whose date buckets are derived from the pubDate values in the configured timezone

#### Scenario: an Atom feed yields dated candidates

- **WHEN** the system reads an Atom document containing one entry with a title, a `link href` attribute, a summary and an updated timestamp
- **THEN** it yields one candidate whose url is the `href` value, whose summary comes from the summary element, and whose date bucket is derived from the updated timestamp

#### Scenario: one failing feed does not stop the others

- **WHEN** the system reads three feeds and one of them returns a non-success status
- **THEN** it reports that feed as failed, yields candidates from the other two, and continues

#### Scenario: duplicate urls collapse to one candidate

- **WHEN** two items in one feed carry the same url with different capitalisation in the host and a tracking parameter
- **THEN** the system yields one candidate for that url and keeps the first occurrence

### Requirement: Article body acquisition

The system SHALL acquire an article body by invoking the headless browser as a subprocess with an argument array and without a shell. It SHALL pass a flag that blocks requests to private and internal network addresses, and it SHALL pass a hard deadline and an output size cap. It SHALL refuse a URL whose scheme is not http or https. It SHALL run at most a fixed number of fetches at once. It SHALL NOT pass the process environment of the application to the browser, so the browser cannot read the provider credential or the GitHub token. A fetch that fails, exceeds its deadline, or returns a non-success status SHALL be reported as a failure for that article and SHALL NOT fail the date.

#### Scenario: a private address is not fetched

- **WHEN** a feed item carries a url whose host resolves to a private or internal address
- **THEN** the system refuses the url, reports the article as failed, and continues with the other articles

#### Scenario: a browser that exceeds its deadline is killed

- **WHEN** a page runs JavaScript past the hard deadline
- **THEN** the system terminates the subprocess, reports the article as failed, and continues with the other articles

#### Scenario: the browser cannot read the run's secrets

- **WHEN** the system fetches an article
- **THEN** the subprocess receives a minimal environment that does not contain the provider credential or the GitHub token

### Requirement: Candidate selection

The system SHALL ask a model to choose which candidates are worth reading, presenting each candidate's title, source, date, url and the opening of its body. The model's answer SHALL be a set of references into the candidate list. The system SHALL drop every reference that does not name a candidate it offered, and SHALL NOT accept a url, a title, or any other text as a selection. The selection SHALL NOT contain article bodies beyond their openings.

#### Scenario: a reference to an unknown candidate is dropped

- **WHEN** the model answers with a reference that names no offered candidate
- **THEN** the system drops that reference and keeps the references that do name offered candidates

#### Scenario: the model cannot introduce a url

- **WHEN** the model's answer contains text that looks like a url
- **THEN** the system ignores that text, because a selection is a set of references and nothing else

### Requirement: Digest composition

The system SHALL ask a model to write the digest, presenting only the bodies of the selected candidates. The model's answer SHALL be a section per selected article, each carrying a reference to its candidate and prose. The system SHALL require the answer to be complete, and SHALL fail the date when the answer is truncated or cannot be parsed into the expected shape. The system SHALL NOT publish a digest with fewer than one section.

#### Scenario: a truncated answer fails the date

- **WHEN** the model's answer stops part way through and does not carry a complete section for every selected article
- **THEN** the system fails the date with a named cause, and publishes nothing for that date

#### Scenario: prose is kept separate from the candidate data

- **WHEN** the model returns prose for a selected article
- **THEN** the prose is kept as prose and the url, title and source of that article still come from the candidate the reference names

### Requirement: Durable per-date record

The system SHALL keep one durable record per date, keyed by that date, in the same storage as the transcript. The record SHALL hold the attempt number, the candidates of that date, the selections, the composed prose and the last failure. The record SHALL NOT hold a flag saying the date was published. The system SHALL determine how far a date got by which of those artifacts are present, and SHALL NOT store that as a separate field. The record SHALL use an explicit null for an artifact that does not exist yet, and SHALL NOT omit the field.

#### Scenario: the record survives a restart

- **WHEN** the system writes a date's record, closes the storage and opens it again
- **THEN** reading that date returns the record as it was written

#### Scenario: no published flag exists

- **WHEN** the system reads a date's record
- **THEN** the record carries no field asserting that the date was published

#### Scenario: an absent artifact is null, not missing

- **WHEN** a date has been discovered but not selected
- **THEN** its selections are explicitly null, and the field is present

### Requirement: Attempt-scoped model requests

The system SHALL identify each model request by the date, the attempt number and the stage. It SHALL submit those requests with that identifier so that resubmitting the same identifier returns the same submission rather than issuing a new one. The system SHALL treat a record with no recorded failure as an attempt that did not end, and SHALL resume that attempt with the same identifiers. The system SHALL start a new attempt, with new identifiers, when the record carries a failure.

#### Scenario: a crash does not pay twice

- **WHEN** a run is interrupted after the selection request was admitted, and the date's record carries no failure
- **THEN** the next run resubmits the same selection identifier, receives the same submission, and does not issue a second model call for that stage

#### Scenario: a recorded failure starts a new attempt

- **WHEN** a date's record carries a failure
- **THEN** the next run increments the attempt number and issues new requests under new identifiers

### Requirement: Article body fetch failures are isolated

The system SHALL exclude a candidate whose body could not be acquired from the selection, and SHALL continue with the remaining candidates. The exclusion SHALL be reported for the date. It SHALL NOT cause the date to fail.

#### Scenario: one article fails to fetch

- **WHEN** nine of ten candidate bodies are acquired and one fails
- **THEN** the selection is offered the nine, the failed one is reported as excluded, and the date is not failed
