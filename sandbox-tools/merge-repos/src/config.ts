import { IRepoSyncDetails } from "./types";

/**
 * This identifies both the initial source and the final destination for the merge.
 * ie. The created PR will be created to merge back into this repo
 */
export const MERGE_ORIGIN_REPO = "MSNev/opentelemetry-sandbox-web-js";

/**
 * Identifies both the initial source and final destination branch for the merge
 * ie. The created PR will be created to merger back into this branch for the Origin Repo
 */
export const MERGE_ORIGIN_MERGE_MAIN_BRANCH = "main";

/**
 * Identifies both the initial source and final destination branch for the merge
 * ie. The created PR will be created to merger back into this branch for the Origin Repo
 */
export const MERGE_ORIGIN_STAGING_BRANCH = "auto-merge/repo-staging";

/**
 * Identifies the working repo to use as the destination fork
 */
export const MERGE_FORK_REPO = "MSNev/opentelemetry-sandbox-web-js";

/**
 * Identifies the branch name that will be used both as the local branch name and 
 * pushed to the destination FORK_REPO all changes will be merged and pushed to this
 * branch name, this will also be used as the "source" branch for the pull request
 */
//export const MERGE_FORK_BRANCH_NAME = "auto-merge/repo-sync-staging";

/**
 * The local relative location to generate the local fork and merge repos
 */
export const MERGE_CLONE_LOCATION = ".auto-merge/temp";

/**
 * The base folder where all of the repositories being merged will be located into.
 */
export const MERGE_DEST_BASE_FOLDER = "auto-merge";

/**
 * The prefix to apply to all local branches
 */
export const BRANCH_PREFIX = "auto-merge";

/**
 * When Committing to the local branches add this as the prefix
 */
export const COMMIT_PREFIX = "[AutoMerge]";

export const reposToSyncAndMerge: IRepoSyncDetails = {
    "otel-js-api": {
        url: "https://github.com/open-telemetry/opentelemetry-js-api",
        branch: "main",
        mergeStartPoint: "v0.17.0",
        destFolder: MERGE_DEST_BASE_FOLDER + "/api",
        // mergeBranchName: BRANCH_PREFIX + "/js-api"
    },
    "otel-js": {
        url: "https://github.com/open-telemetry/opentelemetry-js",
        branch: "main",
        mergeStartPoint: "v0.1.1",
        destFolder: MERGE_DEST_BASE_FOLDER + "/js"
    }
};

export function applyRepoDefaults(theRepos: IRepoSyncDetails) {
    // Set default values
    Object.keys(theRepos).forEach(async (repoName) => {
        let repoDetails = theRepos[repoName];

        repoDetails.destFolder = repoDetails.destFolder || MERGE_DEST_BASE_FOLDER + "/" + repoName;
        repoDetails.mergeBranchName = repoDetails.mergeBranchName || BRANCH_PREFIX + "/" + repoName;
        repoDetails.tagPrefix = repoDetails.tagPrefix || repoName;
    });
}