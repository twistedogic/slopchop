import { SlopchopError } from "./errors.ts";

/** A calendar date in the configured timezone, written as YYYY-MM-DD. */
export type DateKey = string & { readonly __brand: "DateKey" };
/** An http or https url that carries no credentials. */
export type HttpUrl = string & { readonly __brand: "HttpUrl" };
/** Text with no markdown metacharacters and no control characters. */
export type PlainText = string & { readonly __brand: "PlainText" };

const MARKDOWN_METACHARACTERS = /[\\`*_{}\[\]()#+\-!|<>~]/g;

/** Rejects anything that is not a real YYYY-MM-DD date. */
export function dateKey(value: string): DateKey {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) throw new SlopchopError("bad_date", `not a date: ${value}`);
	const [, year, month, day] = match;
	const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
	if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day))
		throw new SlopchopError("bad_date", `not a date: ${value}`);
	return value as DateKey;
}

/** Rejects any scheme other than http and https, and any url carrying credentials. */
export function httpUrl(value: string): HttpUrl {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new SlopchopError("bad_url", `not a url: ${value}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new SlopchopError("bad_url", `scheme is not http: ${value}`);
	if (url.username || url.password) throw new SlopchopError("bad_url", `url carries credentials: ${value}`);
	return url.toString() as HttpUrl;
}

/** Strips the markdown metacharacters and the control characters a feed title may carry. */
export function plainText(value: string): PlainText {
	return [...value]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127 ? " " : character;
		})
		.join("")
		.replace(MARKDOWN_METACHARACTERS, "")
		.replace(/\s+/g, " ")
		.trim() as PlainText;
}

/** The canonical form of a url: lowercased scheme and host, no fragment, no tracking parameters. */
export function canonicalUrl(value: string): string {
	const url = new URL(value);
	url.hash = "";
	url.protocol = url.protocol.toLowerCase();
	url.hostname = url.hostname.toLowerCase();
	for (const name of [...url.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i.test(name)) url.searchParams.delete(name);
	return url.toString();
}
