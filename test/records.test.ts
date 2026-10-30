import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { context, providerModels } from "../src/harness.ts";
import { dateKey, httpUrl, plainText } from "../src/domain.ts";
import { readDateRecord, writeDateRecord } from "../src/records.ts";

test("a date record survives a restart", async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");
	const date = dateKey("2026-10-29");
	const harness = await Harness.open(await openNodeSqliteStorage(db), { models: providerModels(), registry: createRegistry() }, context);
	await writeDateRecord(harness, date, {
		attempt: 2,
		candidates: [{ title: plainText("Rust 1.99.1"), source: plainText("Rust Blog"), url: httpUrl("https://example.com/a"), publishedAt: "2026-10-29T00:00:00Z" }],
	});
	await harness.close(context);

	const reopened = await Harness.open(await openNodeSqliteStorage(db), { models: providerModels(), registry: createRegistry() }, context);
	const record = await readDateRecord(reopened, date);
	assert.equal(record?.attempt, 2);
	assert.equal(record?.candidates?.[0]?.url, "https://example.com/a");
	assert.equal(record?.selections, null);
	assert.equal(record?.prose, null);
	assert.equal(record?.failure, null);
	await reopened.close(context);
});

test("the record holds no published flag and no stage field", async () => {
	const db = join(mkdtempSync(join(tmpdir(), "slopchop-")), "session.sqlite");
	const harness = await Harness.open(await openNodeSqliteStorage(db), { models: providerModels(), registry: createRegistry() }, context);
	const record = await writeDateRecord(harness, dateKey("2026-10-29"), {});
	assert.deepEqual(Object.keys(record).sort(), ["attempt", "candidates", "conversationId", "failure", "prose", "selections"]);
	await harness.close(context);
});
