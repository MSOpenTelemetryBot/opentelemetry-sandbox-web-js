import { SimpleGit, StatusResult } from "simple-git";
import { abort, fail } from "./abort";
import { COMMIT_PREFIX } from "./config";
import { formatIndentLines, log } from "./utils";

export interface ICommitDetails {
    committed: boolean;
    message: string;
}

export async function commitChanges(git: SimpleGit, commitDetails: ICommitDetails) {
    let status = await git.status().catch(abort(git, "Unable to get status")) as StatusResult;
    if (status.conflicted.length > 0) {
        await fail(git, `Conflicting files! -- unable to commit`);
    }
    
    log(`Status: Modified ${status.modified.length}; Deleted: ${status.deleted.length}; Created: ${status.created.length}; Staged: ${status.staged.length}; Renamed: ${status.renamed.length}`);
    if (status.modified.length > 0 || status.deleted.length > 0 || status.created.length > 0 || status.staged.length > 0 || status.renamed.length > 0) {
        log(`Committing Changes - ${formatIndentLines(21, commitDetails.message)}`);
        let commitMessage = COMMIT_PREFIX + " " + commitDetails.message;

        await git.commit(commitMessage, {
            "--no-edit": null,
        }).catch(abort(git, "Unable to Commit"));

        commitDetails.committed = true;
    } else {
        log("No commit required...");
    }

    return commitDetails.committed;
}
