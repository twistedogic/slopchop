import { AssistantEntry } from "@earendil-works/pi-durable";
import { context, openSession } from "./harness.ts";
import { entryText } from "./text.ts";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
	console.error("usage: npm start -- <your question>");
	process.exit(1);
}

const { harness, root } = await openSession();
try {
	const submission = await root.submit({ type: "input", content: prompt }, context);
	const settled = await submission.wait(context);
	if (settled.status !== "done" || settled.type !== "input") {
		console.error(`no answer (${settled.status}): ${settled.reason}`);
		process.exitCode = 1;
	} else {
		const answer = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
		console.log(entryText(answer));
	}
} finally {
	await harness.close(context);
}
