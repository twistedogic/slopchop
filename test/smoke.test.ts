import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { AssistantEntry, createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { entryText } from "../src/text.ts";

const context = BACKGROUND_CONTEXT;

test("a turn is answered and survives a restart", async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");

	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses([fauxAssistantMessage("Paris.")]);

	const harness = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	const root = await harness.root(context, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
	const submission = await root.submit({ type: "input", content: "What is the capital of France?" }, context);
	const settled = await submission.wait(context);
	assert.equal(settled.status, "done");
	assert.equal(settled.type, "input");
	const answer = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
	assert.equal(entryText(answer), "Paris.");
	await harness.close(context);

	// The transcript is durable: reopening the same database finds the answer again.
	const reopened = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	const entries = await (await reopened.root(context)).entries({ order: "ascending" }, 10, undefined, context);
	assert.equal(entries.items.length, 2);
	assert.equal(entryText(entries.items[1]), "Paris.");
	await reopened.close(context);
});
