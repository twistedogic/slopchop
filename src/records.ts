import { defineDocFamily, type Harness } from "@earendil-works/pi-durable";
import type { DateKey, HttpUrl, PlainText } from "./domain.ts";
import { context } from "./harness.ts";

/** One article the feeds offered, as the application read it. */
export type Candidate = {
	title: PlainText;
	source: PlainText;
	url: HttpUrl;
	/** The publication timestamp, as the feed gave it. */
	publishedAt: string;
};

/** One composed section: the candidate it is about, and the model's prose for it. */
export type Section = {
	/** The index of the candidate in the day's candidate list. */
	ref: number;
	text: string;
};

/**
 * The durable record of one date. It holds what the run decided and wrote, and
 * nothing else: no published flag, and no field naming how far the date got.
 */
export type DateRecord = {
	attempt: number;
	/** The conversation this attempt runs in, so a resumed attempt reuses it. */
	conversationId: string | null;
	candidates: Candidate[] | null;
	selections: number[] | null;
	prose: Section[] | null;
	failure: string | null;
};

export const DateRecordDoc = defineDocFamily<DateRecord, DateKey>({
	scope: "session",
	kind: "slopchop-date",
	version: 1,
	family: true,
	initial: () => ({
		attempt: 0,
		conversationId: null,
		candidates: null,
		selections: null,
		prose: null,
		failure: null,
	}),
	checkpointWhen: () => true,
});

/** One dated run's outcomes, kept so a gap in the archive can be explained later. */
export type RunReport = {
	/** The run's id: the moment it started. */
	startedAt: string;
	/** One line per date the run considered. */
	outcomes: { date: string; status: "published" | "skipped" | "failed" | "abandoned"; cause: string | null }[];
};

export const RunReportDoc = defineDocFamily<RunReport, string>({
	scope: "session",
	kind: "slopchop-run",
	version: 1,
	family: true,
	initial: (seed) => ({ startedAt: seed, outcomes: [] }),
	checkpointWhen: () => true,
});

/** The record of one date, or undefined when the date has never been touched. */
export async function readDateRecord(harness: Harness, date: DateKey): Promise<DateRecord | undefined> {
	return (await harness.snapshot(DateRecordDoc, date, context)) as DateRecord | undefined;
}

/** Writes the record of one date and returns it as it now stands. */
export async function writeDateRecord(harness: Harness, date: DateKey, patch: Partial<DateRecord>): Promise<DateRecord> {
	await harness.commit(async (tx) => {
		const draft = await tx.doc(DateRecordDoc, date, date);
		Object.assign(draft, patch);
	}, context);
	return (await readDateRecord(harness, date)) as DateRecord;
}

/** The report of one run, or undefined when the run id is unknown. */
export async function readRunReport(harness: Harness, runId: string): Promise<RunReport | undefined> {
	return (await harness.snapshot(RunReportDoc, runId, context)) as RunReport | undefined;
}

/** Keeps the report of one run, so a gap in the archive can be explained later. */
export async function writeRunReport(harness: Harness, runId: string, report: RunReport): Promise<RunReport> {
	await harness.commit(async (tx) => {
		const draft = await tx.doc(RunReportDoc, runId, runId);
		Object.assign(draft, report);
	}, context);
	return (await readRunReport(harness, runId)) as RunReport;
}
