import * as fs from "fs";
import { SimpleGit } from "simple-git";
import { fail } from "./abort";
import { createGit } from "./createGit";
import { addRemoteAndFetch, getRemoteList } from "./remotes";
import { getUser, setUser } from "./userDetails";
import { log } from "./utils";


/**
 * Create a new local git instance in the `forkDest` folder
 * @param git - The master default git SimpleGit instance
 * @param forkDest - The folder to create the new got clone instance of the originRepo
 * @param originRepo - The originRepo in the form <owner>/<reponame>
 * @param originBranch - The origin branch to use as the source branch for the local clone
 * @param workingLocalBranch - The working local branch name to use
 * @returns A new SimpleGit instance for working with the new local cloned origin repo in the forkDest
 */
export async function createLocalBranch(git: SimpleGit, forkDest: string, originRepo: string, originBranch: string, workingLocalBranch: string): Promise<SimpleGit> {

    if (fs.existsSync(forkDest)) {
        log(`Removing previous working dest ${forkDest}`);
        fs.rmSync(forkDest, { recursive: true });
        if (fs.existsSync(forkDest)) {
            await fail(null, `Failed to remove previous ${forkDest}`)
        }
    }

    let userDetails = await getUser(git);

    const repoTokens = originRepo.split("/");
    if (repoTokens.length !== 2) {
        fail(git, `${originRepo} must be in the format <owner>/<repo-name>`);
    }

    const repoName = repoTokens[1];

    let destUser = userDetails.name;
    if (!destUser || destUser.indexOf(" ") !== -1) {
        destUser = userDetails.user;
    }

    const originRepoUrl = "https://github.com/" + originRepo;
    const destRepo = destUser + "/" + repoName;
    const destRepoUrl =  "https://github.com/" + destRepo;

    if (destRepo === originRepo && originBranch === workingLocalBranch) {
        fail(git, `Unable to continue: The destination repo ${destRepo} and branch ${workingLocalBranch} for the current user ${userDetails.name}\n` +
                `cannot be the same as the origin repo ${originRepo} and branch ${originBranch}.\n` +
                `You MUST set and provide the destination user credentials in the github action before calling this script`);
    }

    log(`Cloning the source repo ${originRepo} branch ${originBranch} to ${forkDest}`);
    await git.clone(originRepoUrl, forkDest, [ "-b", originBranch]);

    // Create a new SimpleGit instance for the clone destination
    let mergeGit = createGit(forkDest, "merge.git");

    await setUser(mergeGit, userDetails);

    let cloneRemotes = await getRemoteList(mergeGit);
    log(`Clone Remotes: ${JSON.stringify(cloneRemotes, null, 4)}`);

    // Switch around the remotes so that the destination repo is the origin

    log(`Setting origin repo as ${destRepo}`);
    if (cloneRemotes.origin) {
        await mergeGit.removeRemote("origin");
    }

    // Add the origin remote and fetch so we get all available branches
    await mergeGit.addRemote("origin", destRepoUrl);

    log(`Setting upstream repo to ${originRepo}`);
    if (cloneRemotes.upstream) {
        await mergeGit.removeRemote("upstream");
    }
    await addRemoteAndFetch(mergeGit, "upstream", { url: originRepoUrl, branch: null });
    //await mergeGit.addRemote("upstream", originRepoUrl);

    cloneRemotes = await getRemoteList(mergeGit);
    log(`New Remotes: ${JSON.stringify(cloneRemotes, null, 4)}`);

    log(`Creating new local branch ${workingLocalBranch} from upstream/${originBranch}`);
    await mergeGit.checkout([
        "-b", workingLocalBranch,
        "upstream/" + originBranch
    ]);

    log(`Status ${JSON.stringify(await mergeGit.status(), null, 4)}`);

    return mergeGit;
}
