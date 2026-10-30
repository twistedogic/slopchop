import { SlopchopError } from "./errors.ts";
import { dateKey, type DateKey } from "./domain.ts";
import { githubClient, postPath, type GitHubClient, type GitHubTarget } from "./github.ts";

export type PublishResult = {
	status: "published" | "unchanged" | "conflict";
	path: string;
};

/**
 * Publishes one post through the Contents API. The bytes go as Base64, an
 * existing post is never overwritten, and an existing post whose bytes match
 * is a success that changes nothing.
 */
export async function publishPost(github: GitHubClient, target: GitHubTarget, date: DateKey, bytes: Buffer): Promise<PublishResult> {
	const path = postPath(target, date);
	const existing = await github.request(`/repos/${target.repo}/contents/${path}?ref=${target.branch}`);
	if (existing.status === 200) {
		const body = (await existing.json()) as { content?: string };
		const current = Buffer.from((body.content ?? "").replace(/\n/g, ""), "base64");
		return { status: current.equals(bytes) ? "unchanged" : "conflict", path };
	}
	if (existing.status !== 404) throw new SlopchopError("github_error", `${existing.status} reading ${path}`);
	const written = await github.request(`/repos/${target.repo}/contents/${path}`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			message: `publish ${date}`,
			content: bytes.toString("base64"),
			branch: target.branch,
		}),
	});
	if (written.status === 200 || written.status === 201) return { status: "published", path };
	const body = (await written.json().catch(() => ({}))) as { message?: string };
	if (written.status === 409 || written.status === 422) return { status: "conflict", path };
	throw new SlopchopError("github_error", `${written.status} writing ${path}: ${body.message ?? "failed"}`);
}

export type PublishedState = {
	/** The dates the repository holds a post for. */
	dates: DateKey[];
	/** The urls the published posts inside the coverage window cover. */
	urls: Set<string>;
};

type TreeEntry = { path: string; type: string; sha: string };

/**
 * Reads the publish state back from the published artifact: the dates the
 * repository holds and the urls its posts cover. A truncated listing is
 * refused rather than acted on.
 */
export async function readPublished(github: GitHubClient, target: GitHubTarget, window: DateKey[]): Promise<PublishedState> {
	const branchTree = await github.getJson<{ tree?: TreeEntry[]; truncated?: boolean }>(`/repos/${target.repo}/git/trees/${target.branch}?recursive=1`);
	if (branchTree.truncated) throw new SlopchopError("truncated_tree", `the tree of ${target.branch} is truncated`);
	const contentTree = (branchTree.tree ?? []).find((entry) => entry.path === target.contentDir && entry.type === "tree");
	if (!contentTree) return { dates: [], urls: new Set() };
	const subtree = await github.getJson<{ tree?: TreeEntry[]; truncated?: boolean }>(`/repos/${target.repo}/git/trees/${contentTree.sha}`);
	if (subtree.truncated) throw new SlopchopError("truncated_tree", `the tree of ${target.contentDir} is truncated`);
	const inside = (subtree.tree ?? []).filter((entry) => entry.type === "blob" && entry.path.endsWith(".md"));
	const dates: DateKey[] = [];
	const urls = new Set<string>();
	for (const entry of inside) {
		const date = entry.path.slice(entry.path.lastIndexOf("/") + 1, -3);
		let key: DateKey;
		try {
			key = dateKey(date);
		} catch {
			continue;
		}
		dates.push(key);
		if (!window.includes(key)) continue;
		const blob = await github.getJson<{ content?: string; encoding?: string }>(`/repos/${target.repo}/git/blobs/${entry.sha}`);
		const text = Buffer.from((blob.content ?? "").replace(/\n/g, ""), blob.encoding === "base64" ? "base64" : "utf8").toString("utf8");
		for (const match of text.matchAll(/\]\(<([^>]+)>\)/g)) urls.add(match[1] as string);
	}
	return { dates, urls };
}
