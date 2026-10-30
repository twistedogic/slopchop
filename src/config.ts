/** One configuration source for the whole run. Every value is read from the environment once, here. */
export type FeedConfig = {
	/** The name a candidate's source carries. */
	name: string;
	url: string;
};

export type Config = {
	provider: string;
	model: string;
	repo: string;
	branch: string;
	/** The directory inside the published repository that holds the dated posts. */
	contentDir: string;
	timezone: string;
	/** How many days back the run considers, and how far back a published url counts as covered. */
	coverageDays: number;
	/** How many attempts a date may cost before it is abandoned. */
	maxAttempts: number;
	feeds: FeedConfig[];
	/** The credential store the provider reads its key from. */
	credentialsPath: string;
	dbPath: string;
	/** The headless browser binary. */
	browser: string;
	/** The hard deadline of one body fetch, in milliseconds. */
	fetchTimeoutMs: number;
	/** The output cap of one body fetch, in bytes. */
	fetchMaxBytes: number;
	/** How many body fetches run at once. */
	fetchConcurrency: number;
	/** How many characters of a body the selection call sees. */
	excerptChars: number;
	/** How many candidates one day may carry. */
	maxCandidates: number;
};

const DEFAULT_FEEDS: FeedConfig[] = [
	{ name: "Rust Blog", url: "https://blog.rust-lang.org/feed.xml" },
	{ name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/" },
	{ name: "Hacker News", url: "https://hnrss.org/frontpage?points=100" },
];

const number = (value: string | undefined, fallback: number): number => {
	const parsed = Number(value);
	return value !== undefined && Number.isFinite(parsed) ? parsed : fallback;
};

const feeds = (value: string | undefined): FeedConfig[] =>
	value === undefined
		? DEFAULT_FEEDS
		: value
			.split(",")
			.map((url) => url.trim())
			.filter(Boolean)
			.map((url, index) => ({ name: new URL(url).hostname, url }));

export const config: Config = {
	provider: process.env.SLOPCHOP_PROVIDER ?? "minimax",
	model: process.env.SLOPCHOP_MODEL ?? "MiniMax-M3",
	repo: process.env.SLOPCHOP_REPO ?? "twistedogic/slopchop",
	branch: process.env.SLOPCHOP_BRANCH ?? "main",
	contentDir: process.env.SLOPCHOP_CONTENT_DIR ?? "content",
	timezone: process.env.SLOPCHOP_TZ ?? "Asia/Hong_Kong",
	coverageDays: number(process.env.SLOPCHOP_COVERAGE_DAYS, 3),
	maxAttempts: number(process.env.SLOPCHOP_MAX_ATTEMPTS, 3),
	feeds: feeds(process.env.SLOPCHOP_FEEDS),
	credentialsPath: process.env.SLOPCHOP_CREDENTIALS ?? `${process.env.HOME ?? "~"}/.pi/agent/auth.json`,
	dbPath: process.env.SLOPCHOP_DB ?? "data/session.sqlite",
	browser: process.env.SLOPCHOP_BROWSER ?? "lightpanda",
	fetchTimeoutMs: number(process.env.SLOPCHOP_FETCH_TIMEOUT_MS, 20_000),
	fetchMaxBytes: number(process.env.SLOPCHOP_FETCH_MAX_BYTES, 200_000),
	fetchConcurrency: number(process.env.SLOPCHOP_FETCH_CONCURRENCY, 4),
	excerptChars: number(process.env.SLOPCHOP_EXCERPT_CHARS, 1200),
	maxCandidates: number(process.env.SLOPCHOP_MAX_CANDIDATES, 30),
};
