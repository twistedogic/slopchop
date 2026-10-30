import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { SlopchopError } from "./errors.ts";

export type Lock = {
	path: string;
	release(): void;
};

const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

/**
 * Takes the exclusive run lock beside the database. A lock whose owning
 * process is gone is taken over rather than blocking the run forever.
 */
export function acquireLock(path: string): Lock {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const handle = openSync(path, "wx");
			writeSync(handle, String(process.pid));
			closeSync(handle);
			return {
				path,
				release: () => {
					try {
						unlinkSync(path);
					} catch {
						// The lock is already gone.
					}
				},
			};
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			const owner = Number(readFileSync(path, "utf8").trim());
			if (Number.isFinite(owner) && owner > 0 && alive(owner))
				throw new SlopchopError("lock_held", `another run holds the lock (pid ${owner})`);
			unlinkSync(path);
		}
	}
	throw new SlopchopError("lock_held", `the lock ${path} could not be taken`);
}
