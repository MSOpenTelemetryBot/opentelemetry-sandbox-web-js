import { IRepoDetails, IRepoSyncDetails } from "./types";

export async function processRepos(theRepos: IRepoSyncDetails, cb: (name: string, details: IRepoDetails) => Promise<any>) {
    let repoNames = Object.keys(theRepos);
    for (let lp = 0; lp < repoNames.length; lp++) {
        let repoName = repoNames[lp];
        await cb(repoName, theRepos[repoName]);
    }
}