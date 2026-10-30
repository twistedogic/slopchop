import type { Conversation, Harness } from "@earendil-works/pi-durable";
import { config } from "./config.ts";
import { SlopchopError } from "./errors.ts";
import { fetchBodies } from "./fetch.ts";
import { composePrompt, conversationPort, parseSections, parseSelection, selectionPrompt } from "./model.ts";
import type { Candidate } from "./records.ts";
import { writeDateRecord } from "./records.ts";
import type { DateKey } from "./domain.ts";
import type { Digest } from "./render.ts";

export type Exclusion = { url: string; reason: string };

export type DayOutcome =
	| { status: "digest"; digest: Digest; excluded: Exclusion[] }
	| { status: "skipped"; reason: string; excluded: Exclusion[] };

export type DayInput = {
	harness: Harness;
	date: DateKey;
	/** The candidates the feeds offered for this date. */
	candidates: Candidate[];
	conversation: Conversation;
	attempt: number;
	/** The bodies, when the caller already holds them. */
	bodies?: Map<string, string>;
	/** The body fetcher, so a test can supply its own. */
	fetch?: typeof fetchBodies;
};

/**
 * One day: fetch the bodies, let the model choose, let the model write, and
 * record every stage. A failure of the date is recorded and thrown; a failure
 * of one article only excludes that article.
 */
export async function curateDay(input: DayInput): Promise<DayOutcome> {
	const { harness, date, candidates, conversation, attempt } = input;
	const port = conversationPort(conversation);
	const requestId = (stage: string): string => `slopchop/${date}/${attempt}/${stage}`;
	const excluded: Exclusion[] = [];
	try {
		const bodies = input.bodies ?? new Map<string, string>();
		if (!input.bodies) {
			const fetched = await (input.fetch ?? fetchBodies)(
				candidates.map((candidate) => candidate.url),
				{
					binary: config.browser,
					timeoutMs: config.fetchTimeoutMs,
					maxBytes: config.fetchMaxBytes,
					concurrency: config.fetchConcurrency,
				},
			);
			for (const result of fetched) {
				if (result.body === null) excluded.push({ url: result.url, reason: result.reason ?? "unknown" });
				else bodies.set(result.url, result.body);
			}
		}
		const kept = candidates.filter((candidate) => bodies.has(candidate.url));
		await writeDateRecord(harness, date, { candidates: kept });
		if (kept.length === 0) throw new SlopchopError("no_bodies", "no article body could be acquired");

		const offered = parseSelection(await port.complete(requestId("select"), selectionPrompt(kept, bodies, config.excerptChars)));
		const selection = [...new Set(offered)].filter((ref) => ref >= 0 && ref < kept.length);
		await writeDateRecord(harness, date, { selections: selection });
		if (selection.length === 0) return { status: "skipped", reason: "nothing was worth reading", excluded };

		const written = parseSections(await port.complete(requestId("compose"), composePrompt(kept, bodies, selection)));
		const sections = selection
			.map((ref, index) => written.find((section) => section.ref === ref))
			.filter((section): section is { ref: number; text: string } => section !== undefined)
			.map((section, index) => ({ ref: index, text: section.text }));
		if (sections.length === 0) throw new SlopchopError("no_sections", "the answer carried no section");
		if (sections.length !== selection.length)
			throw new SlopchopError("incomplete_answer", `the answer carried ${sections.length} of ${selection.length} sections`);
		await writeDateRecord(harness, date, { prose: sections });
		return {
			status: "digest",
			digest: { date, candidates: selection.map((ref) => kept[ref] as Candidate), sections },
			excluded,
		};
	} catch (error) {
		await writeDateRecord(harness, date, { failure: error instanceof SlopchopError ? error.reason : "unknown" });
		if (error instanceof SlopchopError) error.exclusions.push(...excluded);
		throw error;
	}
}
