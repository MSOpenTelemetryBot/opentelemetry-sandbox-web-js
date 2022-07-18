/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CleanOptions, FileStatusResult, SimpleGit, StatusResult } from "simple-git";
import * as fs from "fs";
import * as path from "path";
import { IRepoDetails, IRepoSyncDetails } from "./types";
import { findCurrentRepoRoot, formatIndentLines, log } from "./utils";
import { applyRepoDefaults, MERGE_CLONE_LOCATION, reposToSyncAndMerge, MERGE_ORIGIN_REPO, MERGE_ORIGIN_STAGING_BRANCH } from "./config";
import { addCleanupCallback, doCleanup } from "./clean";
import { abort, fail, terminate } from "./abort";
import { createGit } from "./createGit";
import { commitChanges, ICommitDetails } from "./commit";
import { processRepos } from "./processRepos";
import { addRemoteAndFetch, removeRemote, removeTemporaryRemotes } from "./remotes";
import { isIgnoreFolder } from "./isIgnoreFolder";
import { renameTags } from "./renameTags";
import { pushToBranch } from "./pushToBranch.ts";
import { createLocalBranch } from "./createLocalBranch";
import { createPullRequest, gitHubCreateForkRepo } from "./github";
import { checkPrExists } from "./checkPrExists";
import { parseArgs, ParsedOptions, SwitchBase } from "./parseArgs";
import { getUser, setUser } from "./userDetails";

interface SyncRepoToStagingOptions extends SwitchBase {
    cloneTo: string;
    originRepo: string;
    originBranch: string;
}

const _gitRoot = findCurrentRepoRoot();
let _mergeGitRoot: string;
let _currentBranch: string;
let _theArgs: ParsedOptions<SyncRepoToStagingOptions> = {
    failed: false,
    values: [],
    switches: {
        "cloneTo": MERGE_CLONE_LOCATION,
        // "forkBranch": MERGE_FORK_BRANCH_NAME,
        // "forkRepo": MERGE_FORK_REPO,
        "originBranch": MERGE_ORIGIN_STAGING_BRANCH,
        "originRepo": MERGE_ORIGIN_REPO
    }
};

/**
 * Show the Help for this tool
 */
function showHelp() {
    var scriptParts;
    var scriptName = _theArgs.name;
    if (scriptName.indexOf("\\") !== -1) {
        scriptParts = scriptName.split("\\");
        scriptName = scriptParts[scriptParts.length - 1];
    } else if (scriptName.indexOf("/") !== -1) {
        scriptParts = scriptName.split("/");
        scriptName = scriptParts[scriptParts.length - 1];
    }

    console.log("");
    console.log(scriptName + " [-cloneTo <...>][-originBranch <...>][-originRepo <...>]");
    console.log("".padEnd(99, "-"));
    console.log(formatIndentLines(25, ` -cloneTo <location>    - The working location of where to clone the original repo, defaults to \"${MERGE_CLONE_LOCATION}\"`, 99));
    console.log(formatIndentLines(25, ` -originBranch <branch> - Identifies both the initial source and final destination branch for the merge, defaults to \"${MERGE_ORIGIN_STAGING_BRANCH}\"`, 99));
    console.log(formatIndentLines(25, ` -originRepo <repo>     - This identifies both the initial source and the final destination for the merge, defaults to \"${MERGE_ORIGIN_REPO}\"`, 99));

    terminate(2);
}

/**
 * Initialize this script by creating a new git clone instance of the originRepo
 * @param localGit - The SimpleGit instance to use for the current initial repository
 * @param originRepo - The originRepo in the form <owner>/<reponame>
 * @param originBranch - The origin branch to use as the source branch for the local clone
 * @param workingBranch - Identifies the local working branch that will also be pushed to the current users repo
 * @returns A new SimpleGit instance for working with the new local cloned origin repo in the forkDest
 */
async function _init(localGit: SimpleGit, originRepo: string, originBranch: string, workingBranch: string): Promise<SimpleGit> {
    _currentBranch = (await localGit.branch()).current;
    log("Current Branch: " + _currentBranch);

    addCleanupCallback(async () => {
        let currentBranch = (await localGit.branch()).current;
        if (currentBranch !== _currentBranch) {
            log(`Switching back to ${_currentBranch}`);
            await localGit.checkout(_currentBranch).catch(abort(localGit, `Unable to checkout ${_currentBranch}`));
        }
    });

    // Set default values
    applyRepoDefaults(reposToSyncAndMerge);

    _mergeGitRoot = path.resolve(_gitRoot, _theArgs.switches.cloneTo).replace(/\\/g, "/");
    log(`MergeRoot: ${_mergeGitRoot}`);

    const repoTokens = originRepo.split("/");
    if (repoTokens.length !== 2) {
        fail(localGit, `${originRepo} must be in the format <owner>/<repo-name>`);
    }

    const repoName = repoTokens[1];

    let userDetails = await getUser(localGit);
    let destUser = userDetails.name;
    if (!destUser || destUser.indexOf(" ") !== -1) {
        destUser = userDetails.user;
    }

    // Make sure the user has forked the repo and if not create one
    await gitHubCreateForkRepo(_gitRoot, originRepo);

    // Now lets go and create a local repo
    let mergeGit = await createLocalBranch(localGit, _mergeGitRoot, originRepo, originBranch, destUser, repoName, workingBranch, userDetails);

    await removeTemporaryRemotes(mergeGit, reposToSyncAndMerge);
    await removePotentialMergeConflicts(mergeGit, reposToSyncAndMerge, _mergeGitRoot);

    return mergeGit;
}

/**
 * Remove any files that may cause merge conflicts from the source branch that we are going to merge into
 * @param git - The SimpleGit instance to use for this repo
 * @param theRepos - The configured repos that we are going to merge into this branch
 * @param baseFolder - The base folder for this repo
 */
async function removePotentialMergeConflicts(git: SimpleGit, theRepos: IRepoSyncDetails, baseFolder: string) {
    log("Removing Potential merge conflicting files from original branch");
    const files = fs.readdirSync(baseFolder);
    let removed = 0;

    let details = "Deleted...";
    for (let lp = 0; lp < files.length; lp++) {
        let inputFile = files[lp];
        if (!isIgnoreFolder(theRepos, inputFile, true)) {
            log(`Deleting ${inputFile}`);
            await git.rm(inputFile).catch(abort(git, `Unable to remove ${inputFile}`));
            details += "\n - " + inputFile;
            removed++;
        }
    };

    if (removed > 0) {
        await commitChanges(git, {
            committed: false,
            message: `Removed ${removed} potential conflicting file${removed > 1 ? "s" : ""}${details}`
        });
    }
}

/**
 * Merge the remote original master source repo (opentelemetry-js; opentelemetry-js-api) into the
 * current branch of the provided git instance. This is how the history from the original master
 * repo's are "moved" into the sandbox repo
 * @param git - The SimpleGit instance to use for the local merge repo
 * @param name - The configured name of the original master repo that is represented by the `details`
 * @param details - The details of the original master repo that we want to merge into this branch
 */
async function mergeRemoteIntoBranch(git: SimpleGit, name: string, details: IRepoDetails) {

    let checkoutArgs = [
        "--progress",
        "-B", details.mergeBranchName
    ];

    if (details.mergeStartPoint) {
        // Used for testing the the consistent "merging" over time based on using the configured
        // tags (startPoints) from the original master repo.
        checkoutArgs.push(details.mergeStartPoint);
    }

    // Create the a local branch of the original master remote repository to be merged into
    log(`Creating branch ${details.mergeBranchName} - ${JSON.stringify(checkoutArgs, null, 4)}`);
    await git.checkout(checkoutArgs);

    // Reset the local branch to the requested HEAD (or mergeStartPoint -- used for testing)
    log("Resetting...");
    await git.reset(["--hard"]).catch(abort(git, "Failed to hard reset"));

    // Remove any untracked files in this local branch
    log("Cleaning...");
    // The excludes where for local development / branch purposes to ensure local changes where not lost
    await git.clean([CleanOptions.RECURSIVE, CleanOptions.FORCE, CleanOptions.EXCLUDING], ["sandbox-tools/**", "-e", "/.vs"]).catch(abort(git, "Failed during clean"));

    // Merge changes from the remote repo to this branch
    log(`Merging branch ${details.mergeBranchName}`);

    let mergeArgs = [
        "--allow-unrelated-histories",
        "--no-commit",
        // "-s", "recursive",
        "-X", "theirs",
        "--progress",
        "--no-edit",
        // "--no-ff",
        details.mergeBranchName
    ];

    let remoteHead = await git.listRemote([
        name,
        "HEAD"
    ]).catch(abort(git, `Failed listing remote ${name} HEAD`)) as string;
    let commitHash = /([^\s]*)/.exec(remoteHead)[1];
    let hashDetails = await git.show(["-s", commitHash]).catch(abort(git, `Failed getting hash details ${commitHash}`));
    let commitDetails: ICommitDetails = {
        committed: false,
        message: `Merging branch ${details.mergeBranchName} @ ${commitHash}\n${hashDetails}`
    };

    await git.merge(mergeArgs).catch(async (reason) => {
        // Resolve any unexpected conflicts (Generally there should not be any) as this local branch is "new" (this was primarily for testing merging scenarios)
        commitDetails.committed = await resolveConflictsToTheirs(git, commitDetails, false);
    });

    // // Commit changes to local branch
    // commitPerformed.committed = await commitChanges(git, commitPerformed);

    // Move the local branch files into a sub-folder
    //await moveRepoTo(git, _mergeGitRoot, details.destFolder, commitDetails);

    // Commit changes to local branch
    commitDetails.committed = await commitChanges(git, commitDetails);

    let ignoreTags: string[] = [];
    Object.keys(reposToSyncAndMerge).forEach((value) => {
        ignoreTags.push(reposToSyncAndMerge[value].tagPrefix + "/");
    });

    // rename the tags from the original repos so they have a prefix and remove the original
    await renameTags(reposToSyncAndMerge, git, details.tagPrefix + "/", ignoreTags)
}

function getFileStatus(status: StatusResult, name: string): FileStatusResult {
    for (let lp = 0; lp < status.files.length; lp++) {
        if (status.files[lp].path === name) {
            return status.files[lp];
        }
    }

    return null;
}

/**
 * ' ' = unmodified
 * M = modified
 * T = file type changed (regular file, symbolic link or submodule)
 * A = added
 * D = deleted
 * R = renamed
 * C = copied (if config option status.renames is set to "copies")
 * U = updated but unmerged
 * 
 * index      workingDir     Meaning
 * -------------------------------------------------
 *            [AMD]   not updated
 * M          [ MTD]  updated in index
 * T          [ MTD]  type changed in index
 * A          [ MTD]  added to index                        <-- (T) not handled
 * D                  deleted from index
 * R          [ MTD]  renamed in index
 * C          [ MTD]  copied in index
 * [MTARC]            index and work tree matches           <-- Not handled here as === Not conflicting
 * [ MTARC]      M    work tree changed since index
 * [ MTARC]      T    type changed in work tree since index <-- not handled, should not occur
 * [ MTARC]      D    deleted in work tree
 *               R    renamed in work tree
 *               C    copied in work tree
 * -------------------------------------------------
 * D             D    unmerged, both deleted
 * A             U    unmerged, added by us                 <-- not handled, should not occur
 * U             D    unmerged, deleted by them
 * U             A    unmerged, added by them
 * D             U    unmerged, deleted by us
 * A             A    unmerged, both added
 * U             U    unmerged, both modified
 * -------------------------------------------------
 * ?             ?    untracked
 * !             !    ignored
 * -------------------------------------------------
 */
async function resolveConflictsToTheirs(git: SimpleGit, commitDetails: ICommitDetails, performCommit: boolean): Promise<boolean> {

    function logAppendMessage(commitMessage: string, fileStatus :FileStatusResult, message: string) {
        log(` - (${fileStatus.index.padEnd(1)}${fileStatus.working_dir.padEnd(1)}) ${fileStatus.path} - ${message}`);
        return commitMessage + `\n - (${fileStatus.index.padEnd(1)}${fileStatus.working_dir.padEnd(1)}) ${fileStatus.path} - ${message}`;
    }

    let status = await git.status().catch(abort(git, "Unable to get status")) as StatusResult;
    if (status.conflicted.length === 0) {
        log(`No Conflicts - ${commitDetails.message}`)
        // No Conflicts
        return false;
    }

    log(`Resolving ${status.conflicted.length} conflicts`);
    commitDetails.message += "\nAuto resolving conflicts";
    commitDetails.message += "\n------------------------------------------------------------------------------------------------";
    for (let lp = 0; lp < status.conflicted.length; lp++) {
        let conflicted = status.conflicted[lp];
        let fileStatus = getFileStatus(status, conflicted);
        if (fileStatus.index === "D") {
            // index      workingDir     Meaning
            // -------------------------------------------------
            // D                  deleted from index
            // D             D    unmerged, both deleted
            // D             U    unmerged, deleted by us
            commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Removed from theirs");
            await git.rm(conflicted);
        } else if (fileStatus.index === "A") {
            // index      workingDir     Meaning
            // -------------------------------------------------
            // [ MTARC]      M    work tree changed since index
            // [ MTARC]      D    deleted in work tree
            // A             A    unmerged, both added
            // A             U    unmerged, added by us                     <-- really means that it was deleted but merge didn't resolve
            // -------------------------------------------------
            // Not handled
            // -------------------------------------------------
            // [MTARC]            index and work tree matches               <-- Not conflicting
            // [ MTARC]      T    type changed in work tree since index     <-- Also should not occur
            if (fileStatus.working_dir === "A") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Added in both => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else if (fileStatus.working_dir === "M") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Added in theirs, modified in ours => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else if (fileStatus.working_dir === "D") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Added in theirs, deleted in ours => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else if (fileStatus.working_dir === "U") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Added in ours => try to checkout theirs");
                try {
                    await git.checkout([
                        "--theirs",
                        conflicted
                    ]);
                    await git.add(conflicted);
                } catch (e) {
                    commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "!!! Unable to checkout theirs so assuming it should be deleted");
                    await git.rm(conflicted);
                }
            } else {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, `Unsupported automatic merge state for ${conflicted}`);
            }
        } else if (fileStatus.index === "R") {
            // index      workingDir     Meaning
            // -------------------------------------------------
            // [ MTARC]      M    work tree changed since index
            // [ MTARC]      D    deleted in work tree
            // -------------------------------------------------
            // Not handled
            // -------------------------------------------------
            // [MTARC]            index and work tree matches           <-- Not conflicting
            // [ MTARC]      T    type changed in work tree since index
            if (fileStatus.working_dir === "M") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Renamed in theirs, modified in ours => remove local and checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else if (fileStatus.working_dir === "D") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Renamed in theirs, deleted in ours => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "!!! Unsupported automatic renamed merge state");
            }
        } else if (fileStatus.index === "U") {
            // index      workingDir     Meaning
            // -------------------------------------------------
            // U             D    unmerged, deleted by them
            // U             A    unmerged, added by them
            // U             U    unmerged, both modified
            if (fileStatus.working_dir === "D") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Unmerged, deleted by them => remove");
                await git.rm(conflicted);
            } else if (fileStatus.working_dir === "A") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Unmerged, added by them => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else if (fileStatus.working_dir === "U") {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Unmerged, both modified => checkout theirs");
                await git.checkout([
                    "--theirs",
                    conflicted
                ]);
                await git.add(conflicted);
            } else {
                commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, "Unsupported automatic unmerged state");
            }
        } else {
            commitDetails.message = logAppendMessage(commitDetails.message, fileStatus, " => checkout theirs");
            await git.checkout([
                "--theirs",
                conflicted
            ]);
            await git.add(conflicted);
        }
    }

    status = await git.status().catch(abort(git, "Unable to get status")) as StatusResult;
    if (status.conflicted.length !== 0) {
        status.staged = [ `Removed ${status.staged.length} entries for reporting` ];
        await fail(git, `Still has conflicts ${status.conflicted.length} we can't auto resolve - ${commitDetails.message}\n${JSON.stringify(status, null, 4)}`);
    }

    // Directly committing as using "git merge --continue" will ALWAYS popup an editor
    if (performCommit) {
        return await commitChanges(git, commitDetails);
    }

    return false;
}

async function deleteLocalBranch(git: SimpleGit, name: string, details: IRepoDetails, forceDelete?: boolean) {
    log(`Removing Local branch for ${name}...`)
    let branches = await git.branch().catch(abort(git, "Failed getting branches"));
    if (branches && branches.branches[details.mergeBranchName]) {
        // Remove the local branch
        await git.deleteLocalBranch(details.mergeBranchName, forceDelete).catch(abort(git, `Failed to remove branch for ${name} -- ${details.mergeBranchName}`));
    }
}

async function moveRepoTo(git: SimpleGit, baseFolder: string, srcFolder: string, destFolder: string, commitDetails: ICommitDetails) {

    let theLocalDestPath = path.resolve(path.join(baseFolder, destFolder)).replace(/\\/g, "/") + "/";
    let theGitDestFolder = destFolder;

    if (srcFolder.length === 0) {
        // Don't log this if we are in recursively moving
        log(`Moving Repo to ${theGitDestFolder}; Local dest path: ${theLocalDestPath}`);
    }

    const files = fs.readdirSync(baseFolder + "/" + srcFolder);
    log(`${files.length} file(s) found in ${baseFolder + "/" + srcFolder} to move`);
    if (!fs.existsSync(theLocalDestPath)) {
        fs.mkdirSync(theLocalDestPath, { recursive: true });
    }

    if (files.length > 0) {
        if (srcFolder.length === 0) {
            commitDetails.message += `\nMoving additional unmerged files from ${srcFolder ? srcFolder : "./"} to ${theGitDestFolder}`
        }
        for (let lp = 0; lp < files.length; lp++) {
            let inputFile = files[lp];
            if (inputFile !== destFolder && !isIgnoreFolder(reposToSyncAndMerge, inputFile, srcFolder.length === 0)) {
                let fullInputPath = (srcFolder ? srcFolder + "/" : "") + inputFile;
                let fullDestPath = path.resolve(path.join(theLocalDestPath, inputFile)).replace(/\\/g, "/");

                let moved = false;
                let isSrcDir = false;
                let inputStats = fs.statSync(baseFolder + "/" + fullInputPath);
                if (inputStats.isDirectory()) {
                    log(` - ${fullInputPath}/`);
                    isSrcDir = true;
                } else {
                    log(` - ${fullInputPath}`);
                }

                // if (fs.existsSync(fullDestPath)) {
                //     let destStat = fs.statSync(fullDestPath);
                //     if (destStat.isDirectory()) {
                //         // Destination already exists -- git mv doesn't alway like "moving" onto an existing folder so 
                //         // recursively move the contents
                //         await moveRepoTo(git, baseFolder, fullInputPath, theGitDestFolder + "/" + inputFile, commitDetails);
                //         moved = true;
                //     } else {
                //         log (`Destination is a file!!! ${fullDestPath}`)
                //     }
                // } else if (isSrcDir) {
                //     // Source is a directory and destination doesn't exist -- git mv doesn't always like empty directories so 
                //     // recursively move the contents
                //     await moveRepoTo(git, baseFolder, fullInputPath, theGitDestFolder + "/" + inputFile, commitDetails);
                //     moved = true;
                // }

                if (!moved) {
                    await git.raw([
                        "mv",
                        "--force",
                        "--verbose",
                        fullInputPath + (isSrcDir ? "/" : ""),
                        theGitDestFolder + (isSrcDir ? "/" + inputFile + "/" : "")
                    ]);

                    commitDetails.message += `\n - ${fullInputPath}`;
                }
                //await git.mv(inputFile, destFolder, ).catch(abort(git, `Failed moving ${inputFile} --> ${destFolder}`));
            } else {
                log(` - Ignoring ${inputFile}  (${destFolder})`);
            }
        };

        // if (moved > 0) {
        //     await commitChanges(git, commitDetails);
        // }
    } else {
        log(` - No files found in ${baseFolder + "/" + srcFolder}`);
    }
}

/**
 * Merge the temporary local "merge" (used to merge the original master repos into this repo) branch into the final staging
 * merge branch.
 * @param git 
 * @param destBranch 
 * @param details 
 * @returns 
 */
async function mergeBranchToMergeMaster(git: SimpleGit, destBranch: string, details: IRepoDetails) {
    log(`Merging ${details.mergeBranchName} to merge ${destBranch}`);

    // Switch back to the merge branch 
    log(`Checking out ${destBranch}`);
    await git.checkout(destBranch);
    let mergeCommitMessage: ICommitDetails = {
        committed: false,
        message: `Merging changes from ${details.mergeBranchName}`
    };

    let commitPerformed = false;
    await git.merge([
        "--allow-unrelated-histories",
        "--no-commit",
        "-X", "theirs",
        "--progress",
        "--no-ff",
        "--no-edit",
        details.mergeBranchName]).catch(async (reason) => {
            commitPerformed = await resolveConflictsToTheirs(git, mergeCommitMessage, false);
        });

    // Now Move the merger project to its final destination folder
    await moveRepoTo(git, _mergeGitRoot, "", details.destFolder, mergeCommitMessage);

    return await commitChanges(git, mergeCommitMessage) || commitPerformed;
}

if (!_gitRoot) {
    console.error("Unable to locate the repo root");
    terminate(2);
}

addCleanupCallback(async (git: SimpleGit)  => {
    await removeTemporaryRemotes(git, reposToSyncAndMerge);
});

_theArgs = parseArgs({
    switches: {
        "cloneTo": true,
        "originBranch": true,
        "originRepo": true
    },
    defaults: {
        values: _theArgs.values,
        switches: _theArgs.switches
    }
});

if (_theArgs.switches.showHelp) {
    showHelp();
}

if (_theArgs.failed) {
    fail(null, `Failed parsing arguments - ${JSON.stringify(_theArgs, null, 4)}`);
}

const localGit = createGit(_gitRoot, "local.git");
log(`CWD: ${process.cwd()}; gitRoot: ${_gitRoot}`);

localGit.checkIsRepo().then(async (isRepo) => {
    if (isRepo) {
        log("We have a repo");
        const originRepo = _theArgs.switches.originRepo;
        const originRepoUrl = "https://github.com/" + originRepo;
        const originBranch = _theArgs.switches.originBranch;

        let userDetails = await getUser(localGit);

        let workingBranch = userDetails.name + "/" + (originBranch.replace(/\//g, "-"));
        if (userDetails.name.indexOf(" ") !== -1) {
            workingBranch = userDetails.user + "/" + (originBranch.replace(/\//g, "-"));
        }

        const mergeGit = await _init(localGit, originRepo, originBranch, workingBranch);

        let existingPr = await checkPrExists(mergeGit, _mergeGitRoot, originRepoUrl, originBranch);
        if (existingPr) {
            await fail(localGit, `A PR already exists -- please commit or close the previous PR`)
        }

        let prTitle = "[AutoMerge] Merging change(s) from ";
        let createPr = false;
        
        console.log("Merge all Repos")
        // Merge and Sync all of the source repos
        await processRepos(reposToSyncAndMerge, async (repoName, repoDetails) => {
            log(`Merging ${repoName} from ${repoDetails.url} using ${repoDetails.mergeBranchName} into ${repoDetails.destFolder}`);

            await addRemoteAndFetch(mergeGit, repoName, repoDetails);
            await mergeRemoteIntoBranch(mergeGit, repoName, repoDetails);
            await removeRemote(mergeGit, repoName);
        });

        // Now merge / move each repo into the staging location
        console.log("Now merge repos into main merge staging")
        await processRepos(reposToSyncAndMerge, async (repoName, repoDetails) => {
            if (await mergeBranchToMergeMaster(mergeGit, workingBranch, repoDetails)) {
                prTitle += repoName + "; ";
                createPr = true;
            }
        });

        // Remove local branches
        await processRepos(reposToSyncAndMerge, async (repoName, repoDetails) => {
            await deleteLocalBranch(mergeGit, repoName, repoDetails, true);
        });

        if (createPr && await pushToBranch(mergeGit)) {
            await createPullRequest(mergeGit, _mergeGitRoot, prTitle, null, originRepo, originBranch)
        }

        await doCleanup(mergeGit);
    } else {
        await fail(localGit, "We are not running inside a repo");
    }
}, async (reason) => {
    await fail(localGit, "Unable to check if this is a valid repo - " + JSON.stringify(reason));
});
