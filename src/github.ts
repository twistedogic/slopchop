import { SlopchopError } from "./errors.ts";

/** The GitHub repository the publisher writes to and reads its state from. */
export type GitHubTarget = {
	repo: string;
	branch: string;
	/** The directory inside the repository that holds the dated posts. */
	contentDir: string;
};

export type GitHubClient = {
	/** The raw response of one API call. */
	request(path: string, init?: RequestInit): Promise<Response>;
	getJson<T>(path: string): Promise<T>;
	putJson<T>(path: string, body: unknown): Promise<T>;
};

const API = "https://api.github.com";

/** The token the publisher authenticates with. The gh cli keeps one in the keychain a Pi does not have. */
export function githubToken(): string {
	const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
	if (!token) throw new SlopchopError("no_github_token", "GITHUB_TOKEN is not set");
	return token;
}

/** A GitHub client bound to one repository. */
export function githubClient(target: GitHubTarget, token: string = githubToken()): GitHubClient {
	const headers = {
		accept: "application/vnd.github+json",
		authorization: `Bearer ${token}`,
		"x-github-api-version": "2022-11-28",
		"user-agent": "slopchop",
	};
	const request = async (path: string, init?: RequestInit): Promise<Response> =>
		fetch(`${API}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) } });
	const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
		const response = await request(path, init);
		const body = (await response.json().catch(() => ({}))) as T & { message?: string };
		if (!response.ok) throw new SlopchopError("github_error", `${response.status} ${path}: ${body.message ?? "failed"}`);
		return body;
	};
	return {
		request,
		getJson: <T>(path: string) => json<T>(path),
		putJson: <T>(path: string, body: unknown) =>
			json<T>(path, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
	};
}

/** The path of one dated post inside the repository. */
export const postPath = (target: GitHubTarget, date: string): string => `${target.contentDir}/${date}.md`;
