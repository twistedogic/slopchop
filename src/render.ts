import { type DateKey } from "./domain.ts";
import { SlopchopError } from "./errors.ts";
import type { Candidate, Section } from "./records.ts";

/** What one curated day is worth: the date, the chosen candidates, and the prose. */
export type Digest = {
	date: DateKey;
	/** The chosen candidates, in the order the model chose them. A section's ref is an index in this list. */
	candidates: Candidate[];
	sections: Section[];
};

/**
 * Escapes the characters markdown would read as structure, and the colon of a
 * url-like token, so that prose is shown rather than interpreted.
 */
export const escapeMarkdown = (value: string): string =>
	value.replace(/([\\`*_{}\[\]()#!|<>~])/g, "\\$1").replace(/\b([a-z][a-z0-9+.-]*):/gi, "$1\\:");

/**
 * Renders one digest into the bytes of a post. The frontmatter is the
 * application's own: the date, a title and a description it derived. Every link
 * is a candidate the application chose, and every destination is written
 * inside angle brackets.
 */
export function renderPost(digest: Digest): Buffer {
	const sources = [...new Set(digest.candidates.map((candidate) => candidate.source))];
	const title = `Daily digest for ${digest.date}`;
	const description = `${digest.candidates.length} ${digest.candidates.length === 1 ? "story" : "stories"} from ${sources.join(" and ") || "the feeds"}.`;
	const frontmatter = ["---", `title: ${JSON.stringify(title)}`, `date: ${JSON.stringify(digest.date)}`, `description: ${JSON.stringify(description)}`, "---", ""].join("\n");
	const body = digest.sections
		.map((section) => {
			const candidate = digest.candidates[section.ref];
			if (!candidate) throw new SlopchopError("bad_section", `the section names no candidate: ${section.ref}`);
			return [
				`## ${escapeMarkdown(candidate.title)}`,
				"",
				escapeMarkdown(section.text).trim(),
				"",
				`${escapeMarkdown(candidate.source)} · [the original article](<${candidate.url}>)`,
				"",
			].join("\n");
		})
		.join("\n");
	return Buffer.from(`${frontmatter}\n${body}`, "utf8");
}
