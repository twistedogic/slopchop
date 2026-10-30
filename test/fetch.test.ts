import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { httpUrl } from "../src/domain.ts";
import { browserArgv, childEnv, fetchBody, type FetchOptions } from "../src/fetch.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const browser = process.env.SLOPCHOP_BROWSER ?? "lightpanda";
const hasBrowser = (): boolean => {
	try {
		execFileSync(process.platform === "win32" ? "where" : "which", [browser], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

let server: Server;
let port = 0;

before(async () => {
	server = createServer((request, response) => {
		if (request.url === "/hang") return;
		response.writeHead(200, { "content-type": "text/html" });
		response.end("<html><body><article><h1>A title</h1><p>The body of the article.</p></article></body></html>");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	port = (server.address() as AddressInfo).port;
});

after(() => server.close());

const options = (overrides: Partial<FetchOptions> = {}): FetchOptions => ({
	binary: browser,
	timeoutMs: 5000,
	maxBytes: 1000,
	concurrency: 2,
	...overrides,
});

test("the command line carries the private network block, the deadline and the output cap", () => {
	const argv = browserArgv("https://example.com/a", options());
	assert.ok(argv.includes("--block-private-networks"));
	assert.ok(argv.includes("--terminate-ms"));
	assert.ok(argv.includes("--dump-max-bytes"));
	assert.ok(argv.includes("markdown"));
	assert.deepEqual(argv.slice(0, 2), [browser, "fetch"]);
});

test("the browser cannot read the run's secrets", () => {
	process.env.OPENAI_API_KEY = "sk-not-a-real-key";
	process.env.GITHUB_TOKEN = "ghp-not-a-real-token";
	const env = childEnv();
	assert.equal(env.OPENAI_API_KEY, undefined);
	assert.equal(env.GITHUB_TOKEN, undefined);
	delete process.env.OPENAI_API_KEY;
	delete process.env.GITHUB_TOKEN;
});

test("a private address is refused", async (t) => {
	if (!hasBrowser()) return t.skip(`${browser} is not installed`);
	const result = await fetchBody(httpUrl(`http://127.0.0.1:${port}/`), options());
	assert.equal(result.body, null);
	assert.ok(result.reason);
});

test("a browser that exceeds its deadline is killed", async () => {
	const result = await fetchBody(httpUrl(`http://127.0.0.1:${port}/hang`), options({ binary: join(fixtures, "browser-slow.js"), timeoutMs: 1000 }));
	assert.equal(result.body, null);
	assert.match(result.reason ?? "", /exceeded|exited/);
});

test("the dumped body respects the output cap", async () => {
	const result = await fetchBody(httpUrl("https://example.com/a"), options({ binary: join(fixtures, "browser-big.js"), maxBytes: 1000 }));
	assert.ok(result.body);
	assert.ok(result.body.length <= 1000, `the body was ${result.body.length} bytes`);
});
