import { createModels } from "@earendil-works/pi-ai/models";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { config } from "../src/config.ts";
import { fileCredentialStore } from "../src/credentials.ts";

/**
 * Reports which providers can be used from this machine: the credential each
 * one resolves, and one completion with the stop reason it ends on.
 *
 *   node scripts/provider-probe.ts
 */
const models = createModels({ credentials: fileCredentialStore(config.credentialsPath) });
for (const provider of builtinProviders()) models.setProvider(provider);

for (const provider of models.getProviders()) {
	const auth = await models.checkAuth(provider.id);
	const ids = models.getModels(provider.id).map((model) => model.id);
	const model = models.getModel(provider.id, ids[0] as string);
	if (!model || !auth) {
		console.log(`${provider.id}: no credential`);
		continue;
	}
	try {
		const answer = await models.completeSimple(model, { messages: [{ role: "user", content: "Reply with the single word: ok" }] }, { maxTokens: 32 });
		console.log(`${provider.id}/${model.id}: stopReason=${answer.stopReason} usage=${JSON.stringify(answer.usage)}`);
	} catch (error) {
		console.log(`${provider.id}/${model.id}: ${(error as Error).message.slice(0, 120)}`);
	}
}
