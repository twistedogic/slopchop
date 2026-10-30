/** A failure with a name the report, the log and the record all print. */
export class SlopchopError extends Error {
	/** The name of the cause, printed by the report and by the log. */
	readonly reason: string;
	/** The articles that were excluded before the failure, when there were any. */
	readonly exclusions: { url: string; reason: string }[];

	constructor(reason: string, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SlopchopError";
		this.reason = reason;
		this.exclusions = [];
	}
}
