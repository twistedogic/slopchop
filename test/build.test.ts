import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("the build turns every dated post into a page and the archive lists them newest first", () => {
	execFileSync("npm", ["run", "build"], { stdio: "pipe" });
	const archive = readFileSync("dist/index.html", "utf8");
	const dates = [...archive.matchAll(/href="\/slopchop\/(\d{4}-\d{2}-\d{2})\//g)].map((match) => match[1] as string);
	assert.ok(dates.length > 0, "the archive lists no post");
	assert.deepEqual(dates, [...dates].sort().reverse());
	assert.ok(existsSync("dist/style.css"));
	for (const date of dates) {
		const page = readFileSync(`dist/${date}/index.html`, "utf8");
		assert.match(page, /<link rel="stylesheet" href="\/slopchop\/style.css" \/>/);
		assert.match(page, /<h1>/);
	}
});
