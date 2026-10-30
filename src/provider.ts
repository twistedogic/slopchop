import type { Models } from "@earendil-works/pi-ai";
import { config } from "./config.ts";
import { SlopchopError } from "./errors.ts";

/**
 * Checks that the configured provider and model are usable, before the run
 * discovers anything. The failure names the cause, so the log says "provider
 * not configured" rather than "selection failed" on every line.
 */
export async function assertProviderReady(models: Models, provider = config.provider, model = config.model): Promise<void> {
	const known = models.getProvider(provider);
	if (!known) throw new SlopchopError("provider_not_ready", `the provider ${provider} is not registered`);
	if (!models.getModel(provider, model)) throw new SlopchopError("provider_not_ready", `the provider ${provider} has no model named ${model}`);
	if (known.auth.apiKey || known.auth.oauth) {
		const auth = await models.checkAuth(provider);
		if (!auth) throw new SlopchopError("provider_not_ready", `the provider ${provider} has no resolvable credential`);
	}
}
