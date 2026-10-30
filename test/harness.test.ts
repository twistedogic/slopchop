import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { AgentDoc, createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { context, openSession } from "../src/harness.ts";

test("the conversation is configured with the run's provider and model on every start", async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");
	const models = createModels();
	models.setProvider(fauxProvider().provider);

	// A database whose root already holds a different provider.
	const first = await Harness.open(await openNodeSqliteStorage(db), { models, registry: createRegistry() }, context);
	await first.root(context, { agent: { model: { provider: "openai", modelId: "gpt-4.1-mini" } } });
	await first.close(context);

	const { harness, root } = await openSession(db, models, { provider: "faux", modelId: "faux-1" });
	const agent = await harness.snapshot(AgentDoc, root.id, context);
	assert.equal(agent?.model?.provider, "faux");
	assert.equal(agent?.model?.modelId, "faux-1");
	await harness.close(context);
});
