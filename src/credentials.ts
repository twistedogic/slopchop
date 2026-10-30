import { readFileSync } from "node:fs";
import type { Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";

/**
 * A read-only credential store over the json file pi keeps:
 * one entry per provider id, shaped { type: "api_key", key }.
 */
export function fileCredentialStore(path: string): CredentialStore {
	let cached: Record<string, Credential> | undefined;
	const read = (): Record<string, Credential> => {
		if (cached === undefined) {
			try {
				cached = JSON.parse(readFileSync(path, "utf8")) as Record<string, Credential>;
			} catch {
				cached = {};
			}
		}
		return cached;
	};
	return {
		async read(providerId) {
			return read()[providerId];
		},
		async list(): Promise<readonly CredentialInfo[]> {
			return Object.entries(read()).map(([providerId, credential]) => ({ providerId, type: credential.type }));
		},
		async modify() {
			throw new Error("the credential store is read only");
		},
		async delete() {
			throw new Error("the credential store is read only");
		},
	};
}
