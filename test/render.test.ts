import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, httpUrl, plainText } from "../src/domain.ts";
import type { Candidate } from "../src/records.ts";
import { renderPost, type Digest } from "../src/render.ts";

const candidate = (url: string, title = "A title with [brackets] and a *star*"): Candidate => ({
	title: plainText(title),
	source: plainText("Rust Blog"),
	url: httpUrl(url),
	publishedAt: "2026-10-29T00:00:00Z",
});

const digest = (candidates: Candidate[], prose: string): Digest => ({
	date: dateKey("2026-10-29"),
	candidates,
	sections: candidates.map((_, index) => ({ ref: index, text: prose })),
});

/** Every url-like token in the bytes, with the scheme it carries. */
const schemes = (bytes: string): string[] =>
	[...bytes.matchAll(/([a-z][a-z0-9+.-]*):(?=\S)/gi)].map((match) => (match[1] as string).toLowerCase());

test("the rendered file carries no url whose scheme is not http or https", () => {
	const bytes = renderPost(digest([candidate("https://example.com/a")], "See https://evil.example/x and javascript:alert(1).")).toString("utf8");
	for (const scheme of schemes(bytes)) assert.ok(["http", "https"].includes(scheme), `the file carries a ${scheme} url`);
});

test("a url containing a closing parenthesis survives inside the destination", () => {
	const bytes = renderPost(digest([candidate("https://example.com/a)b")], "The prose.")).toString("utf8");
	assert.ok(bytes.includes("](<https://example.com/a)b>)"), bytes);
});

test("the model prose cannot make a link of its own", () => {
	const bytes = renderPost(digest([candidate("https://example.com/a")], "A link to [evil](https://evil.example/y) here.")).toString("utf8");
	assert.equal(bytes.split("](").length - 1, 1);
	assert.ok(!bytes.includes("](https://evil.example/y)"));
});

test("the frontmatter carries values the application derived", () => {
	const bytes = renderPost(digest([candidate("https://example.com/a")], "A prose the model wrote.")).toString("utf8");
	const frontmatter = bytes.slice(0, bytes.indexOf("---", 4));
	assert.match(frontmatter, /title: "Daily digest for 2026-10-29"/);
	assert.match(frontmatter, /date: "2026-10-29"/);
	assert.match(frontmatter, /description: "1 story from Rust Blog\."/);
	assert.ok(!frontmatter.includes("A prose the model wrote"));
});
