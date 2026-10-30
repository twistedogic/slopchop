import { canonicalUrl, dateKey, httpUrl, plainText, type DateKey, type HttpUrl } from "./domain.ts";
import { SlopchopError } from "./errors.ts";
import type { Candidate } from "./records.ts";
import type { FeedConfig } from "./config.ts";

/** One item of a feed, as the reader found it. */
export type FeedItem = {
	title: string;
	link: string;
	publishedAt: string;
};

const decodeEntities = (value: string): string =>
	value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");

/** The text of one element, with CDATA unwrapped and entities decoded. */
const tagText = (block: string, name: string): string | undefined => {
	const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
	if (!match) return undefined;
	return decodeEntities((match[1] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
};

/** The value of one attribute of the first element with that name. */
const attribute = (block: string, tag: string, name: string): string | undefined => {
	const match = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, "i").exec(block);
	return match?.[1];
};

/**
 * The tolerant reader: RSS items and Atom entries in one pass. A block that
 * lacks a title, a link or a timestamp is skipped rather than failing the feed.
 */
export function parseFeed(xml: string): FeedItem[] {
	if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new SlopchopError("not_a_feed", "the document is not a feed");
	const items: FeedItem[] = [];
	for (const block of xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? []) {
		const alternate = /<link\\b[^>]*rel="alternate"[^>]*href="([^"]*)"/i.exec(block)?.[1];
		const link = tagText(block, "link") ?? alternate ?? attribute(block, "link", "href");
		const title = tagText(block, "title");
		const publishedAt = tagText(block, "pubDate") ?? tagText(block, "published") ?? tagText(block, "updated") ?? tagText(block, "date");
		if (!title || !link || !publishedAt) continue;
		items.push({ title, link: link.trim(), publishedAt: publishedAt.trim() });
	}
	return items;
}

/** The date a timestamp falls on, in the configured timezone. */
export function bucketDate(timestamp: string, timezone: string): DateKey {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) throw new SlopchopError("bad_timestamp", `not a timestamp: ${timestamp}`);
	return dateKey(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date));
}

export type Discovery = {
	/** The candidates of each date the feeds covered. */
	byDate: Map<DateKey, Candidate[]>;
	/** The feeds that failed, and why. */
	failed: { name: string; reason: string }[];
};

/**
 * Reads every configured feed over plain HTTP. A feed that fails, times out or
 * cannot be parsed is reported and does not stop the others.
 */
export async function discover(feeds: FeedConfig[], timezone: string, fetchImpl: typeof fetch = fetch): Promise<Discovery> {
	const byDate = new Map<DateKey, Candidate[]>();
	const failed: { name: string; reason: string }[] = [];
	const seen = new Set<string>();
	for (const feed of feeds) {
		let xml: string;
		try {
			const response = await fetchImpl(feed.url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "slopchop" } });
			if (!response.ok) throw new SlopchopError("feed_status", `${response.status} ${feed.url}`);
			xml = await response.text();
		} catch (error) {
			failed.push({ name: feed.name, reason: error instanceof Error ? error.message : String(error) });
			continue;
		}
		let items: FeedItem[];
		try {
			items = parseFeed(xml);
		} catch (error) {
			failed.push({ name: feed.name, reason: error instanceof Error ? error.message : String(error) });
			continue;
		}
		for (const item of items) {
			let url: HttpUrl;
			let key: string;
			try {
				key = canonicalUrl(item.link);
				url = httpUrl(key);
			} catch {
				continue;
			}
			if (seen.has(key)) continue;
			seen.add(key);
			let date: DateKey;
			try {
				date = bucketDate(item.publishedAt, timezone);
			} catch {
				continue;
			}
			const candidate: Candidate = {
				title: plainText(item.title),
				source: plainText(feed.name),
				url,
				publishedAt: item.publishedAt,
			};
			const bucket = byDate.get(date) ?? [];
			bucket.push(candidate);
			byDate.set(date, bucket);
		}
	}
	return { byDate, failed };
}
