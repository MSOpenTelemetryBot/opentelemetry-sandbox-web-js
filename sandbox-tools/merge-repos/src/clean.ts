import { SimpleGit } from "simple-git";
import { CleanupFunc } from "./types";
import { log } from "./utils";

let _cleanupFuncs: CleanupFunc[] = [];
let _cleaning = false;

export function addCleanupCallback(cb: CleanupFunc) {
    _cleanupFuncs.push(cb);
}

export async function doCleanup(git: SimpleGit) {
    if (!_cleaning && git) {
        _cleaning = true;
        log("Cleaning up...");

        for (let lp = 0; lp < _cleanupFuncs.length; lp++) {
            try {
                await _cleanupFuncs[lp](git);
            } catch (e) {
                // Do nothing
            }
        }

        _cleaning = false;
    }
}
