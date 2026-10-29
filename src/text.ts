import type { EntryRecord } from "@earendil-works/pi-durable";

/** The text of an entry's assistant message; other kinds have none. */
export function entryText(entry: EntryRecord | undefined): string {
	const message = entry?.model?.[0];
	return message?.role === "assistant" ? message.content.map((block) => (block.type === "text" ? block.text : "")).join("") : "";
}
