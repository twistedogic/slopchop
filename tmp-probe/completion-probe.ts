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
		let all: Record<string, Credential> = {};
		try { all = JSON.parse(readFileSync(`${process.env.HOME}/.pi/agent/auth.json`, "utf8")); } catch {}
		return all[id];
	},
	async list(): Promise<readonly CredentialInfo[]> { return []; },
	async modify() { return undefined; },
	async delete() {},
};

const models = createModels({ credentials: store });
models.setProvider(openaiProvider());
models.setProvider(openaiCodexProvider());
models.setProvider(googleProvider());
models.setProvider(minimaxProvider());
models.setProvider(zaiProvider());

const candidates: [string, string][] = [
	["openai-codex", "gpt-6-sol"],
	["openai", "gpt-4.1-mini"],
	["google", "gemini-2.5-flash"],
	["minimax", "MiniMax-M3"],
	["zai", "glm-4.7"],
];

for (const [provider, modelId] of candidates) {
	const model = models.getModel(provider, modelId);
	if (!model) { console.log(`${provider}/${modelId}: no model`); continue; }
	try {
		const answer = await models.completeSimple(model, { messages: [{ role: "user", content: "Reply with the single word: ok" }] }, { maxTokens: 64 });
		const text = answer.content.map((b) => (b.type === "text" ? b.text : "")).join("");
		console.log(`${provider}/${modelId}: stopReason=${answer.stopReason} usage=${JSON.stringify(answer.usage)} text=${JSON.stringify(text.slice(0, 60))}`);
	} catch (error) {
		console.log(`${provider}/${modelId}: ERROR ${(error as Error).message.slice(0, 200)}`);
	}
}
