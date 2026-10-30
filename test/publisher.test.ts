import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey } from "../src/domain.ts";
import type { GitHubClient, GitHubTarget } from "../src/github.ts";
import { publishPost, readPublished } from "../src/publisher.ts";

const target: GitHubTarget = { repo: "twistedogic/slopchop", branch: "main", contentDir: "content" };

const fakeGithub = (routes: Record<string, { status: number; body?: unknown }>) => {
	const calls: { path: string; init?: RequestInit }[] = [];
	const client: GitHubClient = {
		async request(path, init) {
			calls.push({ path, init });
			const route = routes[path];
			if (!route) return new Response("{}", { status: init?.method === "PUT" ? 201 : 404 });
			return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
		},
		async getJson<T>(path: string): Promise<T> {
			const response = await client.request(path);
			return (await response.json()) as T;
		},
		async putJson<T>(path: string, body: unknown): Promise<T> {
			const response = await client.request(path, { method: "PUT", body: JSON.stringify(body) });
			return (await response.json()) as T;
		},
	};
	return { client, calls };
};

test("the published bytes travel as Base64 and decode back byte for byte", async () => {
	const bytes = Buffer.from("---\ntitle: \"A post\"\n---\n\nThe body.\n", "utf8");
	const { client, calls } = fakeGithub({});
	const result = await publishPost(client, target, dateKey("2026-10-29"), bytes);
	assert.equal(result.status, "published");
	const put = calls.find((call) => call.init?.method === "PUT");
	assert.ok(put);
	const body = JSON.parse(String(put.init?.body)) as { content: string; branch: string };
	assert.equal(body.branch, "main");
	assert.deepEqual(Buffer.from(body.content, "base64"), bytes);
});

test("an existing post with different bytes is a conflict and is left alone", async () => {
	const bytes = Buffer.from("new bytes", "utf8");
	const other = Buffer.from("other bytes", "utf8");
	const { client, calls } = fakeGithub({
		"/repos/twistedogic/slopchop/contents/content/2026-10-29.md?ref=main": { status: 200, body: { content: other.toString("base64") } },
	});
	const result = await publishPost(client, target, dateKey("2026-10-29"), bytes);
	assert.equal(result.status, "conflict");
	assert.equal(calls.filter((call) => call.init?.method === "PUT").length, 0);
});

test("an existing post with identical bytes is a success that changes nothing", async () => {
	const bytes = Buffer.from("same bytes", "utf8");
	const { client, calls } = fakeGithub({
		"/repos/twistedogic/slopchop/contents/content/2026-10-29.md?ref=main": { status: 200, body: { content: bytes.toString("base64") } },
	});
	const result = await publishPost(client, target, dateKey("2026-10-29"), bytes);
	assert.equal(result.status, "unchanged");
	assert.equal(calls.filter((call) => call.init?.method === "PUT").length, 0);
});

test("the published state comes from the published artifact", async () => {
	const post = "---\ntitle: \"A post\"\n---\n\nA link to [the article](<https://example.com/a>).\n";
	const { client } = fakeGithub({
		"/repos/twistedogic/slopchop/git/trees/main?recursive=1": {
			status: 200,
			body: { tree: [{ path: "content", type: "tree", sha: "tree-sha" }] },
		},
		"/repos/twistedogic/slopchop/git/trees/tree-sha": {
			status: 200,
			body: { tree: [{ path: "content/2026-10-29.md", type: "blob", sha: "blob-sha" }] },
		},
		"/repos/twistedogic/slopchop/git/blobs/blob-sha": { status: 200, body: { content: Buffer.from(post).toString("base64"), encoding: "base64" } },
	});
	const state = await readPublished(client, target, [dateKey("2026-10-29")]);
	assert.deepEqual(state.dates, ["2026-10-29"]);
	assert.ok(state.urls.has("https://example.com/a"));
});

test("a truncated listing is refused with a named cause", async () => {
	const { client } = fakeGithub({
		"/repos/twistedogic/slopchop/git/trees/main?recursive=1": { status: 200, body: { tree: [], truncated: true } },
	});
	await assert.rejects(() => readPublished(client, target, []), /truncated/);
});
