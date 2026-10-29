import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

export const context = BACKGROUND_CONTEXT;
export const MODEL = process.env.PI_MODEL ?? "gpt-6-sol";
export const DB_PATH = process.env.SLOPCHOP_DB ?? "data/session.sqlite";

/** Opens the durable session and its root conversation. The same database always yields the same transcript. */
export async function openSession(dbPath: string = DB_PATH) {
	mkdirSync(dirname(dbPath), { recursive: true });
	const models = createModels();
	models.setProvider(openaiProvider());
	const harness = await Harness.open(await openNodeSqliteStorage(dbPath), { models, registry: createRegistry() }, context);
	const root = await harness.root(context, { agent: { model: { provider: "openai", modelId: MODEL } } });
	harness.resume();
	return { harness, root };
}
