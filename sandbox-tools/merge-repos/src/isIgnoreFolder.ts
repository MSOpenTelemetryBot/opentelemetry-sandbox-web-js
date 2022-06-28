import { IRepoSyncDetails } from "./types";

export function isIgnoreFolder(theRepos: IRepoSyncDetails, source: string, isRoot: boolean) {
    if (source === "." || source === ".." || source === ".git" || source === ".vs") {
        return true;
    }

    if (isRoot) {
        let repoNames = Object.keys(theRepos);
        for (let lp = 0; lp < repoNames.length; lp++) {
            let destFolder = theRepos[repoNames[lp]].destFolder;
            if (destFolder === source || destFolder.indexOf(source + "/") === 0) {
                return true;
            }
        }
    }

    return false;
}
