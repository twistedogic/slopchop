import type { GitHubClient } from "../src/github.ts";

/** A site that holds the published posts in memory and answers the tree api. */
export function fakeSite(repo = "twistedogic/slopchop") {
	const posts = new Map<string, string>();
	const published: { path: string; bytes: Buffer }[] = [];
	const client: GitHubClient = {
		async request(path, init) {
			if (init?.method === "PUT") {
				const body = JSON.parse(String(init.body)) as { content: string };
				const file = path.replace(`/repos/${repo}/contents/`, "");
				posts.set(file, body.content);
				published.push({ path: file, bytes: Buffer.from(body.content, "base64") });
				return new Response("{}", { status: 201 });
			}
			const contents = new RegExp(`^/repos/${repo}/contents/(.+?)\\?ref=`).exec(path);
			if (contents) {
				const existing = posts.get(contents[1] as string);
				if (!existing) return new Response("{}", { status: 404 });
				return new Response(JSON.stringify({ content: existing }), { status: 200 });
			}
			if (path.includes("/git/trees/") && path.includes("?recursive=1"))
				return new Response(JSON.stringify({ tree: [{ path: "content", type: "tree", sha: "content-sha" }] }), { status: 200 });
			if (path.endsWith("/git/trees/content-sha"))
				return new Response(
					JSON.stringify({
						tree: [...posts.keys()].map((file) => ({ path: `content/${file}`, type: "blob", sha: `sha-${file}` })),
					}),
					{ status: 200 },
				);
			const blob = /\/git\/blobs\/(.+)$/.exec(path);
			if (blob) {
				const file = (blob[1] as string).replace(/^sha-/, "");
				return new Response(JSON.stringify({ content: posts.get(file) ?? "", encoding: "base64" }), { status: 200 });
			}
			return new Response("{}", { status: 404 });
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
	return { client, posts, published };
}

/** A feed carrying one item per date. */
export function feedFor(dates: string[]): string {
	const items = dates
		.map(
			(date) =>
				`<item><title>Article for ${date}</title><link>https://example.com/${date}</link><description>The body.</description><pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate></item>`,
		)
		.join("");
	return `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items}</channel></rss>`;
}
