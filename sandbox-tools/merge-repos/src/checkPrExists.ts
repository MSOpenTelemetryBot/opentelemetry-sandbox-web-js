import * as child_process from "child_process";
import * as util from "util";
import { SimpleGit} from "simple-git";
import { log } from "./utils";
import path = require("path");

const execFile = util.promisify(child_process.execFile);

export async function checkPrExists(git: SimpleGit, gitRoot: string, targetRepo: string, targetBranch) {
    let prExists = false;
    let status = await git.status();
    let branchName = status.current;
    log(`Current Branch: ${branchName}`);

    let cwd = process.cwd();
    try {
        process.chdir(path.resolve(gitRoot));
        log("Checking for existing PR...");
        await execFile("gh", [
            "pr",
            "list",
            "--state", "open",
            "--repo", targetRepo,
            "--base", targetBranch
        ]).then(async (value) => {
            let lines = value.stdout.split("\n");
            if (lines.length > 0) {
                lines.forEach((line) => {
                    if (line) {
                        prExists = true;
                        let tokens = line.split("\t");
                        log(` - #${tokens[0]} - ${tokens[1]}`);
                    }
                })
            }
        });
    } finally {
        process.chdir(cwd);
    }

    return prExists;
}
