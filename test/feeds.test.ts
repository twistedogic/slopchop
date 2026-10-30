import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { bucketDate, discover, parseFeed } from "../src/feeds.ts";

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

test("an RSS feed yields dated candidates", () => {
	const items = parseFeed(fixture("rss.xml"));
	assert.equal(items.length, 3);
	assert.equal(items[0]?.title, "Rust 1.99.1 is out");
	assert.equal(items[0]?.link, "https://example.com/rust-1-99-1");
});

test("an Atom feed yields dated candidates", () => {
	const items = parseFeed(fixture("atom.xml"));
	assert.equal(items.length, 1);
	assert.equal(items[0]?.link, "https://example.org/cloudflare");
});

test("a document that is not a feed is refused", () => {
	assert.throws(() => parseFeed(fixture("broken.xml")), /not a feed/);
});

test("a timestamp falls on the date of the configured timezone", () => {
	assert.equal(bucketDate("2026-10-29T23:30:00Z", "Asia/Hong_Kong"), "2026-10-30");
	assert.equal(bucketDate("2026-10-29T23:30:00Z", "UTC"), "2026-10-29");
});

test("duplicate urls collapse to one candidate and one failing feed does not stop the others", async () => {
	const calls: string[] = [];
	const fetchImpl: typeof fetch = async (input) => {
		const url = String(input);
		calls.push(url);
		if (url === "https://broken.example/feed.xml") return new Response("nope", { status: 500 });
		if (url === "https://html.example/feed.xml") return new Response(fixture("broken.xml"), { status: 200 });
		if (url === "https://atom.example/feed.xml") return new Response(fixture("atom.xml"), { status: 200 });
		return new Response(fixture("rss.xml"), { status: 200 });
	};
	const discovery = await discover(
		[
			{ name: "Broken", url: "https://broken.example/feed.xml" },
			{ name: "Not a feed", url: "https://html.example/feed.xml" },
			{ name: "Atom", url: "https://atom.example/feed.xml" },
			{ name: "RSS", url: "https://rss.example/feed.xml" },
		],
		"UTC",
		fetchImpl,
	);
	assert.equal(discovery.failed.length, 2);
	assert.ok(discovery.failed.some((failure) => failure.name === "Broken"));
	assert.ok(discovery.failed.some((failure) => failure.name === "Not a feed"));
	const candidates = discovery.byDate.get("2026-10-29" as never) ?? [];
	assert.equal(candidates.length, 3);
	assert.deepEqual(
		candidates.map((candidate) => candidate.url),
		["https://example.org/cloudflare", "https://example.com/rust-1-99-1", "https://example.com/inference"],
	);
});
