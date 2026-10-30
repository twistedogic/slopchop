import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { createRegistry, Harness, type Conversation, type ConversationId, type ModelRef } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { config } from "./config.ts";
import { fileCredentialStore } from "./credentials.ts";
import { SlopchopError } from "./errors.ts";

export const context = BACKGROUND_CONTEXT;
export const MODEL = config.model;
export const DB_PATH = config.dbPath;

/** The models collection with the configured provider registered and its credential store wired. */
export function providerModels() {
	const models = createModels({ credentials: fileCredentialStore(config.credentialsPath) });
	const provider = builtinProviders().find((candidate) => candidate.id === config.provider);
	if (!provider) throw new SlopchopError("unknown_provider", `no provider named ${config.provider}`);
	models.setProvider(provider);
	return models;
}

/**
 * Opens the durable session and its root conversation. The same database always
 * yields the same transcript. The model is configured on every start, because
 * harness.root only applies its agent option when it creates the root.
 */
export async function openSession(
	dbPath: string = DB_PATH,
	models = providerModels(),
	model: ModelRef = { provider: config.provider, modelId: config.model },
) {
	mkdirSync(dirname(dbPath), { recursive: true });
	const harness = await Harness.open(await openNodeSqliteStorage(dbPath), { models, registry: createRegistry() }, context);
	const root = await harness.root(context);
	await root.configure({ model }, context);
	harness.resume();
	return { harness, root, models };
}

/** The conversation one attempt runs in: a fresh one, or the one a resumed attempt already owns. */
export async function attemptConversation(
	harness: Harness,
	conversationId: string | null,
	model: ModelRef = { provider: config.provider, modelId: config.model },
): Promise<Conversation> {
	if (conversationId) {
		const existing = await harness.conversation(conversationId as unknown as ConversationId, context);
		if (existing) {
			await existing.configure({ model }, context);
			return existing;
		}
	}
	return harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model } }, context);
}
