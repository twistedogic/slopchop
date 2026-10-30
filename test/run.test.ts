import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { dateKey } from "../src/domain.ts";
import { context } from "../src/harness.ts";
import { acquireLock } from "../src/lock.ts";
import { readDateRecord, readRunReport, writeDateRecord } from "../src/records.ts";
import { run, windowDates } from "../src/run.ts";
import { fakeSite, feedFor } from "./fake-site.ts";

const NOW = new Date("2026-10-30T12:00:00Z");
const MODEL = { provider: "faux", modelId: "faux-1" };

const setup = async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	const harness = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	return { db, faux, models, harness };
};

const bodyFetch = async (urls: string[]) => urls.map((url) => ({ url: url as never, body: `The body of ${url}.`, reason: null }));

const feedFetch = (dates: string[]): typeof fetch => {
	const xml = feedFor(dates);
	return (async () => new Response(xml, { status: 200 })) as typeof fetch;
};

test("the coverage window runs from today back", () => {
	assert.deepEqual(windowDates(dateKey("2026-10-30"), 3), ["2026-10-30", "2026-10-29", "2026-10-28", "2026-10-27"]);
});

test("one date fails and the others publish", async () => {
	const { harness, faux, models } = await setup();
	const site = fakeSite();
	faux.setResponses([
		fauxAssistantMessage('{"pick": [0]}'),
		fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "The write up."}]}'),
		fauxAssistantMessage('{"pick": [0]}'),
		fauxAssistantMessage('{"sections": []}'),
		fauxAssistantMessage('{"pick": [0]}'),
		fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "The write up."}]}'),
	]);
	const result = await run({
		harness,
		models,
		github: site.client,
		feeds: [{ name: "Feed", url: "https://feed.example/rss" }],
		timezone: "UTC",
		coverageDays: 3,
		now: NOW,
		fetchImpl: feedFetch(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]),
		bodyFetch,
		model: MODEL,
		lockPath: join(tmpdir(), `slopchop-lock-${Date.now()}`),
	});
	assert.deepEqual(
		result.outcomes.map((outcome) => `${outcome.date}:${outcome.status}`),
		["2026-10-27:published", "2026-10-28:failed", "2026-10-29:published"],
	);
	assert.equal(result.exitCode, 1);
	assert.deepEqual(
		site.published.map((post) => post.path),
		["content/2026-10-27.md", "content/2026-10-29.md"],
	);
	assert.ok(result.lines.some((line) => line.startsWith("2026-10-28 failed:")));
});

test("the current date is never published and a date outside the window is never attempted", async () => {
	const { harness, faux, models } = await setup();
	const site = fakeSite();
	faux.setResponses([fauxAssistantMessage('{"pick": [0]}'), fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "The write up."}]}')]);
	const result = await run({
		harness,
		models,
		github: site.client,
		feeds: [{ name: "Feed", url: "https://feed.example/rss" }],
		timezone: "UTC",
		coverageDays: 3,
		now: NOW,
		fetchImpl: feedFetch(["2026-10-01", "2026-10-30"]),
		bodyFetch,
		model: MODEL,
		lockPath: join(tmpdir(), `slopchop-lock-${Date.now()}`),
	});
	assert.deepEqual(result.outcomes, []);
	assert.equal(faux.state.callCount, 0);
});

test("a date at the attempt limit is abandoned and costs no model call", async () => {
	const { harness, faux, models } = await setup();
	const site = fakeSite();
	await writeDateRecord(harness, dateKey("2026-10-29"), { attempt: 2, failure: "incomplete_answer" });
	const result = await run({
		harness,
		models,
		github: site.client,
		feeds: [{ name: "Feed", url: "https://feed.example/rss" }],
		timezone: "UTC",
		coverageDays: 3,
		maxAttempts: 3,
		now: NOW,
		fetchImpl: feedFetch(["2026-10-29"]),
		bodyFetch,
		model: MODEL,
		lockPath: join(tmpdir(), `slopchop-lock-${Date.now()}`),
	});
	assert.deepEqual(result.outcomes.map((outcome) => outcome.status), ["abandoned"]);
	assert.equal(faux.state.callCount, 0);
});

test("a provider without a credential fails before any feed is fetched", async () => {
	const { harness, models } = await setup();
	const site = fakeSite();
	const withOpenai = createModels();
	withOpenai.setProvider(openaiProvider());
	let fetched = 0;
	await assert.rejects(
		() =>
			run({
				harness,
				models: withOpenai,
				github: site.client,
				feeds: [{ name: "Feed", url: "https://feed.example/rss" }],
				now: NOW,
				fetchImpl: (async () => {
					fetched++;
					return new Response("", { status: 200 });
				}) as typeof fetch,
				model: { provider: "openai", modelId: "gpt-4.1-mini" },
				lockPath: join(tmpdir(), `slopchop-lock-${Date.now()}`),
			}),
		/provider_not_ready|no resolvable credential/,
	);
	assert.equal(fetched, 0);
});

test("the report of a failed date survives a restart", async () => {
	const { db, harness, faux, models } = await setup();
	const site = fakeSite();
	faux.setResponses([fauxAssistantMessage('{"pick": [0]}'), fauxAssistantMessage('{"sections": []}')]);
	const result = await run({
		harness,
		models,
		github: site.client,
		feeds: [{ name: "Feed", url: "https://feed.example/rss" }],
		timezone: "UTC",
		coverageDays: 3,
		now: NOW,
		fetchImpl: feedFetch(["2026-10-29"]),
		bodyFetch,
		model: MODEL,
		lockPath: join(tmpdir(), `slopchop-lock-${Date.now()}`),
	});
	await harness.close(context);
	const reopened = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	const report = await readRunReport(reopened, result.runId);
	assert.ok(report);
	assert.deepEqual(report?.outcomes, [{ date: "2026-10-29", status: "failed", cause: "no_sections" }]);
	await reopened.close(context);
});

test("the lock is held while it is alive and taken over when its owner is gone", () => {
	const path = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.lock");
	const lock = acquireLock(path);
	assert.throws(() => acquireLock(path), /another run holds the lock/);
	lock.release();
	writeFileSync(path, "999999");
	const taken = acquireLock(path);
	assert.ok(taken);
	taken.release();
});
