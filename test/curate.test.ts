import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { dateKey, httpUrl, plainText } from "../src/domain.ts";
import type { SlopchopError } from "../src/errors.ts";
import { curateDay } from "../src/curate.ts";
import { context } from "../src/harness.ts";
import { conversationPort } from "../src/model.ts";
import { readDateRecord, type Candidate } from "../src/records.ts";

const candidates = (count: number): Candidate[] =>
	Array.from({ length: count }, (_, index) => ({
		title: plainText(`Article ${index}`),
		source: plainText("Rust Blog"),
		url: httpUrl(`https://example.com/${index}`),
		publishedAt: "2026-10-29T00:00:00Z",
	}));

const setup = async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	const harness = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	const conversation = await harness.createConversation(
		{ ownership: { kind: "ownerless" }, agent: { model: { provider: "faux", modelId: "faux-1" } } },
		context,
	);
	return { harness, faux, conversation };
};

const bodies = (urls: string[]): Map<string, string> => new Map(urls.map((url) => [url, `The body of ${url}.`]));

test("a date whose body fetch fails still produces a digest over the remaining candidates", async () => {
	const { harness, faux, conversation } = await setup();
	faux.setResponses([fauxAssistantMessage('{"pick": [0]}'), fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "The write up."}]}')]);
	const outcome = await curateDay({
		harness,
		date: dateKey("2026-10-29"),
		candidates: candidates(2),
		conversation,
		attempt: 0,
		fetch: async (urls) => [
			{ url: urls[0] as never, body: "The body of the first article.", reason: null },
			{ url: urls[1] as never, body: null, reason: "the browser exited with 1" },
		],
	});
	assert.equal(outcome.status, "digest");
	assert.equal(outcome.status === "digest" ? outcome.digest.candidates.length : 0, 1);
	assert.equal(outcome.excluded.length, 1);
	const record = await readDateRecord(harness, dateKey("2026-10-29"));
	assert.equal(record?.candidates?.length, 1);
	assert.equal(record?.failure, null);
});

test("an answer with fewer sections than the selection requires fails the date with a named cause", async () => {
	const { harness, faux, conversation } = await setup();
	faux.setResponses([fauxAssistantMessage('{"pick": [0, 1]}'), fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "Only one."}]}')]);
	await assert.rejects(
		() =>
			curateDay({
				harness,
				date: dateKey("2026-10-29"),
				candidates: candidates(2),
				conversation,
				attempt: 0,
				bodies: bodies(["https://example.com/0", "https://example.com/1"]),
			}),
		/answer carried 1 of 2 sections/,
	);
	const record = await readDateRecord(harness, dateKey("2026-10-29"));
	assert.equal(record?.prose, null);
	assert.equal(record?.failure, "incomplete_answer");
});

test("an answer with no sections at all fails the date with a named cause", async () => {
	const { harness, faux, conversation } = await setup();
	faux.setResponses([fauxAssistantMessage('{"pick": [0]}'), fauxAssistantMessage('{"sections": []}')]);
	await assert.rejects(
		() =>
			curateDay({
				harness,
				date: dateKey("2026-10-29"),
				candidates: candidates(1),
				conversation,
				attempt: 0,
				bodies: bodies(["https://example.com/0"]),
			}),
		(error: unknown) => (error as SlopchopError).reason === "no_sections",
	);
	const record = await readDateRecord(harness, dateKey("2026-10-29"));
	assert.equal(record?.prose, null);
	assert.equal(record?.failure, "no_sections");
});

test("a reference to an unknown candidate is dropped", async () => {
	const { harness, faux, conversation } = await setup();
	faux.setResponses([fauxAssistantMessage('{"pick": [0, 99]}'), fauxAssistantMessage('{"sections": [{"ref": 0, "prose": "The write up."}]}')]);
	const outcome = await curateDay({
		harness,
		date: dateKey("2026-10-29"),
		candidates: candidates(1),
		conversation,
		attempt: 0,
		bodies: bodies(["https://example.com/0"]),
	});
	assert.equal(outcome.status === "digest" ? outcome.digest.candidates.length : 0, 1);
});

test("resubmitting an identifier issues no second model call", async () => {
	const { faux, conversation } = await setup();
	faux.setResponses([fauxAssistantMessage("first"), fauxAssistantMessage("second")]);
	const port = conversationPort(conversation);
	const first = await port.complete("slopchop/2026-10-29/0/select", "the prompt");
	const second = await port.complete("slopchop/2026-10-29/0/select", "the prompt");
	assert.equal(first, "first");
	assert.equal(second, "first");
	assert.equal(faux.state.callCount, 1);
});
