import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

/**
 * Checks that every evidence pointer in the trail resolves: a file that
 * exists, a url that answers, or a command whose binary is installed.
 *
 *   node scripts/check-trail.ts
 */
const text = await readFile("decisions.tsv", "utf8");
const lines = text.split("\n").filter((line) => line.trim() !== "");
const columns = lines[0]?.split("\t") ?? [];
const evidenceColumn = columns.indexOf("evidence");
const rows = lines.slice(1).map((line) => line.split("\t"));

const onPath = (binary: string): boolean => {
	try {
		execFileSync("which", [binary], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const broken: string[] = [];
for (const row of rows) {
	const evidence = row[evidenceColumn] ?? "";
	for (const pointer of evidence.split("; ")) {
		const target = (pointer.split(",")[0] ?? "").trim();
		if (!target) continue;
		if (target.startsWith("http://") || target.startsWith("https://")) {
			try {
				const response = await fetch(target);
				if (response.status >= 400) broken.push(`${target} answered ${response.status}`);
			} catch (error) {
				broken.push(`${target} did not answer: ${(error as Error).message}`);
			}
			continue;
		}
		const path = target.replace(/:\d+(-\d+)?$/, "");
		if (existsSync(path)) continue;
		if (target.includes("/")) {
			broken.push(`${target} is not there`);
			continue;
		}
		const binary = target.split(" ")[0] as string;
		if (!onPath(binary)) broken.push(`${target} names a binary that is not installed`);
	}
}

if (broken.length > 0) {
	console.error(`the trail has ${broken.length} pointer(s) that do not resolve:`);
	for (const pointer of broken) console.error(`  ${pointer}`);
	process.exit(1);
}
console.log(`every evidence pointer in the trail resolves (${rows.length} rows)`);
