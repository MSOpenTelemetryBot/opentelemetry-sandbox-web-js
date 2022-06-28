import { SimpleGit } from "simple-git";
import { abort } from "./abort";
import { IRepoDetails, IRepoSyncDetails } from "./types";
import { log } from "./utils";

const remoteSplitRg = /^([^\s]*)\s*([^\s\(]*)\s*\(([^\)]*)\)$/;

export interface RemoteDetails {
    fetch?: string;
    push?: string;
}

export declare type Remotes = { [name: string] : RemoteDetails };

export async function removeTemporaryRemotes(git: SimpleGit, theRepos: IRepoSyncDetails, ) {
    let repoNames = Object.keys(theRepos);

    let remotes = await getRemoteList(git);

    // Remove any previous remotes
    let remoteNames = Object.keys(remotes);
    for (let lp = 0; lp < remoteNames.length; lp++) {
        let repoName = remoteNames[lp];
        if (remotes[repoName].fetch && repoNames.indexOf(repoName) !== -1) {
            log(`Removing previous remote ${repoName} - ${remotes[repoName].fetch}`);
            await git.removeRemote(repoName);
        }
    }
}

export async function getRemoteList(git: SimpleGit): Promise<Remotes> {
    let details: Remotes = {};
    // Remove any previous remotes
    let remotes = (await git.remote(["-v"]) as string).split("\n");
    for (let lp = 0; lp < remotes.length; lp++) {
        let theRemote = remotes[lp];
        let match = remoteSplitRg.exec(theRemote);
        if (match && match.length === 4) {
            let repoName = match[1];
            let url = match[2];
            let type = match[3];

            let theRepo = details[repoName] = details[repoName] || {};
            if (type === "fetch") {
                theRepo.fetch = url;
            } else if (type === "push") {
                theRepo.push = url;
            }
        }
    }

    return details;
}

/**
 * Add the source origin repo that we are going to merge into this git instance as a remote and fetch the
 * current state of that repo
 * @param git - The SimpleGit instance to use for the local merge repo
 * @param name - The remote name to add the remote URL as
 * @param details - The details of the source repo that are being merged
 */
export async function addRemoteAndFetch(git: SimpleGit, name: string, details: IRepoDetails) {
    log(`Fetching ${name} - ${details.url}`);
    let branch = details.branch;
    if (branch) {
        await git.addRemote(name, details.url, ["-t", details.branch]);
    } else {
        await git.addRemote(name, details.url);
    }
    await git.fetch([name, "--tags", "--progress"]);
    log(`${name} remote fetched`);
}

/**
 * Remove the remote name from the git instance, this is the cleanup step of `addRemoteAndFetch()`
 * @param git - The SimpleGit instance to use for the local merge repo
 * @param name - The remote name to add the remote URL as
 */
export async function removeRemote(git: SimpleGit, name: string) {
    await git.removeRemote(name);
}

