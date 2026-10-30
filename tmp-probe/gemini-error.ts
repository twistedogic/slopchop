import { createModels } from "@earendil-works/pi-ai/models";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
const models = createModels();
models.setProvider(googleProvider());
const model = models.getModel("google", "gemini-2.5-flash");
const answer = await models.completeSimple(model!, { messages: [{ role: "user", content: "ok" }] }, { maxTokens: 32 });
console.log("stopReason:", answer.stopReason, "error:", answer.errorMessage);
