import { fail } from "assert";
import { SimpleGit} from "simple-git";
import { getRemoteList } from "./remotes";
import { log } from "./utils";

export async function pushToBranch(git: SimpleGit) {
    let status = await git.status();
    let branchName = status.current;
    
    log(`${branchName}, status = ahead ${status.ahead}; behind ${status.behind}`);
    if (status.ahead > 0 || status.behind > 0) {

        let remotes = await getRemoteList(git);
        if (!remotes.origin) {
            fail(`Origin remote does not exist ${JSON.stringify(remotes, null, 4)}`);
        }
    
        log(`Pushing changes to - origin/${branchName} => ${remotes.origin.push} for ${status.current}`);

        await git.push([
            "-f",
            "--set-upstream",
            "origin",
            "HEAD:" + branchName
        ]);

        // Push the tags as well
        await git.pushTags(remotes.origin.push);

        return true;
    } else {
        log("No push required...");
    }

    return false;
}
