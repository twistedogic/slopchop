import { readFileSync } from "node:fs";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { minimaxProvider } from "@earendil-works/pi-ai/providers/minimax";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

const store: CredentialStore = {
	async read(id) {
		const file = `${process.env.HOME}/.pi/agent/auth.json`;
		let all: Record<string, Credential> = {};
		try { all = JSON.parse(readFileSync(file, "utf8")); } catch {}
		return all[id];
	},
	async list(): Promise<readonly CredentialInfo[]> { return []; },
	async modify(id, fn) { return undefined; },
	async delete() {},
};

const models = createModels({ credentials: store });
models.setProvider(openaiProvider());
models.setProvider(openaiCodexProvider());
models.setProvider(googleProvider());
models.setProvider(minimaxProvider());
models.setProvider(zaiProvider());

for (const provider of models.getProviders()) {
	const auth = await models.checkAuth(provider.id);
	const modelIds = models.getModels(provider.id).map((m) => m.id);
	console.log(`${provider.id}: auth=${auth ? JSON.stringify(auth) : "none"} models=${modelIds.length} ${modelIds.slice(0, 4).join(",")}`);
}
