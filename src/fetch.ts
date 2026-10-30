import { spawn } from "node:child_process";
import type { HttpUrl } from "./domain.ts";

export type BodyFetch = {
	url: HttpUrl;
	body: string | null;
	/** Why the body could not be acquired, or null when it was. */
	reason: string | null;
};

export type FetchOptions = {
	/** The headless browser binary. */
	binary: string;
	/** The hard deadline of one fetch, in milliseconds. */
	timeoutMs: number;
	/** The output cap of one fetch, in bytes. */
	maxBytes: number;
	/** How many fetches run at once. */
	concurrency: number;
};

/** The argument array the browser is given. No shell, so nothing in a url can become a flag. */
export function browserArgv(url: string, options: FetchOptions): string[] {
	return [
		options.binary,
		"fetch",
		url,
		"--dump",
		"markdown",
		"--block-private-networks",
		"--terminate-ms",
		String(options.timeoutMs),
		"--dump-max-bytes",
		String(options.maxBytes),
	];
}

/** The environment the browser gets: nothing the run holds a secret in. */
export function childEnv(): NodeJS.ProcessEnv {
	return { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C" };
}

/** Fetches one article's body. A failure is reported for that article, not for the day. */
export async function fetchBody(url: HttpUrl, options: FetchOptions): Promise<BodyFetch> {
	return new Promise((resolve) => {
		const child = spawn(options.binary, browserArgv(url, options), { shell: false, env: childEnv() });
		const chunks: Buffer[] = [];
		const errors: string[] = [];
		let settled = false;
		const finish = (body: string | null, reason: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ url, body, reason });
		};
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish(null, `the fetch exceeded ${options.timeoutMs}ms`);
		}, options.timeoutMs + 2000);
		child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString("utf8")));
		child.on("error", (error) => finish(null, error.message));
		child.on("close", (code) => {
			const output = Buffer.concat(chunks).subarray(0, options.maxBytes).toString("utf8");
			if (code !== 0) return finish(null, `the browser exited with ${code}: ${errors.join(" ").slice(0, 200)}`);
			if (!output.trim()) return finish(null, "the browser returned nothing");
			finish(output, null);
		});
	});
}

/** Fetches the bodies of many articles, at most options.concurrency at a time. */
export async function fetchBodies(urls: HttpUrl[], options: FetchOptions): Promise<BodyFetch[]> {
	const results: BodyFetch[] = [];
	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const index = next++;
			results[index] = await fetchBody(urls[index] as HttpUrl, options);
		}
	};
	await Promise.all(Array.from({ length: Math.min(options.concurrency, urls.length) }, worker));
	return results;
}
