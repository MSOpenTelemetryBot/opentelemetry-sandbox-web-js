import { SimpleGit } from "simple-git";
import { doCleanup } from "./clean";
import { dumpObj } from "./utils";

export function terminate(exitCode: number) {
    process.exit(exitCode);
}

export async function fail(git: SimpleGit, message: string) {
    console.error(message);
    await doCleanup(git).catch(() => terminate(11));
    terminate(10);
}

export function abort(git: SimpleGit, message: string) {
    return async function (reason) {
        await fail(git, message + " - " + dumpObj(reason));
    }
}

