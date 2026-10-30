import type { Models } from "@earendil-works/pi-ai";
import type { Harness, ModelRef } from "@earendil-works/pi-durable";
import { config } from "./config.ts";
import type { FeedConfig } from "./config.ts";
import { canonicalUrl, dateKey, type DateKey } from "./domain.ts";
import { SlopchopError } from "./errors.ts";
import { curateDay } from "./curate.ts";
import type { fetchBodies } from "./fetch.ts";
import { discover } from "./feeds.ts";
import { githubClient, type GitHubClient, type GitHubTarget } from "./github.ts";
import { attemptConversation } from "./harness.ts";
import { acquireLock } from "./lock.ts";
import { assertProviderReady } from "./provider.ts";
import { publishPost, readPublished } from "./publisher.ts";
import { readDateRecord, writeDateRecord, writeRunReport } from "./records.ts";
import { renderPost } from "./render.ts";

export type Outcome = {
	date: string;
	status: "published" | "skipped" | "failed" | "abandoned";
	cause: string | null;
};

export type RunResult = {
	runId: string;
	lines: string[];
	outcomes: Outcome[];
	exitCode: number;
};

export type RunOptions = {
	harness: Harness;
	models: Models;
	github?: GitHubClient;
	target?: GitHubTarget;
	feeds?: FeedConfig[];
	timezone?: string;
	coverageDays?: number;
	maxAttempts?: number;
	now?: Date;
	fetchImpl?: typeof fetch;
	lockPath?: string;
	/** The provider and model the run's conversations use. */
	model?: ModelRef;
	/** The body fetcher, so a test can supply its own. */
	bodyFetch?: typeof fetchBodies;
};

/** The date it is now, in the configured timezone. */
export function todayIn(timezone: string, now: Date): DateKey {
	return dateKey(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now));
}

/** The days of the coverage window, newest first: today and the days before it. */
export function windowDates(today: DateKey, days: number): DateKey[] {
	const start = Date.parse(`${today}T00:00:00Z`);
	return Array.from({ length: days + 1 }, (_, index) => dateKey(new Date(start - index * 86_400_000).toISOString().slice(0, 10)));
}

/**
 * One run: the provider is checked, the lock is taken, the published state is
 * read back from the published artifact, and every date the feeds cover inside
 * the coverage window is curated and published, oldest first.
 */
export async function run(options: RunOptions): Promise<RunResult> {
	const target = options.target ?? { repo: config.repo, branch: config.branch, contentDir: config.contentDir };
	const github = options.github ?? githubClient(target);
	const timezone = options.timezone ?? config.timezone;
	const coverageDays = options.coverageDays ?? config.coverageDays;
	const maxAttempts = options.maxAttempts ?? config.maxAttempts;
	const now = options.now ?? new Date();
	const runId = now.toISOString();
	const lines: string[] = [];
	const outcomes: Outcome[] = [];

	// The provider is checked before a feed is fetched and before a model is called.
	await assertProviderReady(options.models, options.model?.provider ?? config.provider, options.model?.modelId ?? config.model);

	const lock = acquireLock(options.lockPath ?? `${config.dbPath}.lock`);
	try {
		const today = todayIn(timezone, now);
		const window = windowDates(today, coverageDays);
		const published = await readPublished(github, target, window);
		const covered = new Set([...published.urls].map((url) => canonicalUrl(url)));
		const discovery = await discover(options.feeds ?? config.feeds, timezone, options.fetchImpl);
		for (const failure of discovery.failed) lines.push(`feed ${failure.name} failed: ${failure.reason}`);

		for (const date of [...window].reverse()) {
			if (date === today) continue;
			if (published.dates.includes(date)) {
				outcomes.push({ date, status: "skipped", cause: "already published" });
				lines.push(`${date} skipped: already published`);
				continue;
			}
			const bucket = discovery.byDate.get(date);
			if (!bucket) continue;
			const offered = bucket.filter((candidate) => !covered.has(canonicalUrl(candidate.url)));
			if (offered.length === 0) {
				outcomes.push({ date, status: "skipped", cause: "every article was already published" });
				lines.push(`${date} skipped: every article was already published`);
				continue;
			}
			const record = await readDateRecord(options.harness, date);
			const attemptsMade = record?.failure ? record.attempt + 1 : (record?.attempt ?? 0);
			if (attemptsMade >= maxAttempts) {
				outcomes.push({ date, status: "abandoned", cause: record?.failure ?? null });
				lines.push(`${date} abandoned after ${attemptsMade} attempts: ${record?.failure ?? "unknown"}`);
				continue;
			}
			const conversation = await attemptConversation(
				options.harness,
				record?.failure ? null : (record?.conversationId ?? null),
				options.model ?? { provider: config.provider, modelId: config.model },
			);
			await writeDateRecord(options.harness, date, {
				attempt: attemptsMade,
				conversationId: String(conversation.id),
				failure: null,
			});
			try {
				const outcome = await curateDay({
					harness: options.harness,
					date,
					candidates: offered,
					conversation,
					attempt: attemptsMade,
					fetch: options.bodyFetch,
				});
				for (const exclusion of outcome.excluded)
					lines.push(`${date} excluded ${exclusion.url}: ${exclusion.reason}`);
				if (outcome.status === "skipped") {
					outcomes.push({ date, status: "skipped", cause: outcome.reason });
					lines.push(`${date} skipped: ${outcome.reason}`);
					continue;
				}
				const bytes = renderPost(outcome.digest);
				const result = await publishPost(github, target, date, bytes);
				if (result.status === "conflict") throw new SlopchopError("conflict", "the published post holds different bytes");
				outcomes.push({ date, status: "published", cause: null });
				lines.push(`${date} published`);
			} catch (error) {
				const cause = error instanceof SlopchopError ? error.reason : "unknown";
				const message = error instanceof Error ? error.message : String(error);
				outcomes.push({ date, status: "failed", cause });
				lines.push(`${date} failed: ${cause}: ${message}`);
			}
		}
	} finally {
		lock.release();
	}

	await writeRunReport(options.harness, runId, { startedAt: runId, outcomes });
	const failed = outcomes.some((outcome) => outcome.status === "failed" || outcome.status === "abandoned");
	return { runId, lines, outcomes, exitCode: failed ? 1 : 0 };
}
