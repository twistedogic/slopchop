import { config } from "./config.ts";
import { context, openSession } from "./harness.ts";
import { SlopchopError } from "./errors.ts";
import { run } from "./run.ts";

const { harness, models } = await openSession();
try {
	const result = await run({ harness, models });
	for (const line of result.lines) console.log(line);
	console.log(`${result.outcomes.filter((outcome) => outcome.status === "published").length} published, ${result.outcomes.filter((outcome) => outcome.status === "skipped").length} skipped, ${result.outcomes.filter((outcome) => outcome.status === "failed").length} failed`);
	process.exitCode = result.exitCode;
} catch (error) {
	const cause = error instanceof SlopchopError ? error.reason : "unknown";
	console.error(`the run stopped: ${cause}: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	await harness.close(context);
}
