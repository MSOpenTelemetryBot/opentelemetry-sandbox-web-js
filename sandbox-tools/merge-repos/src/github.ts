import * as child_process from "child_process";
import * as util from "util";
import { SimpleGit} from "simple-git";
import { log } from "./utils";
import path = require("path");
import { ParsedOptions } from "./parseArgs";

const execFile = util.promisify(child_process.execFile);

export interface Owner {
    id: string;
    login: string
}

export interface Parent {
    id: string;
    name: string;
    owner: Owner;
}
export interface GithubRepo {
    nameWithOwner: string;
    description: string;
    name: string;
    isFork: boolean;
    owner: Owner,
    parent: Parent
}

export async function gitHubListForkRepos(gitRoot: string): Promise<GithubRepo[]> {
    let repos: GithubRepo[] = [];
    let cwd = process.cwd();
    try {
        process.chdir(path.resolve(gitRoot));
        log("Listing existing fork repos...");
        await execFile("gh", [
            "repo",
            "list",
            "--fork",
            "--json", "nameWithOwner,description,isFork,parent,name,owner"
        ]).then(async (value) => {
            repos = JSON.parse(value.stdout);
        });
    } finally {
        process.chdir(cwd);
    }

    return repos
}

export async function gitHubCreateForkRepo(gitRoot: string, repoToFork: string) {
    let repos = await gitHubListForkRepos(gitRoot);
    let hasRepo = false;
    repos.forEach((repo) => {
        if (repo.nameWithOwner === repoToFork) {
            hasRepo = true;
        }
    });

    if (!hasRepo) {
        let cwd = process.cwd();
        try {
            process.chdir(path.resolve(gitRoot));

            log(`Creating fork repo of ${repoToFork}...`);
            await execFile("gh", [
                "repo",
                "fork",
                repoToFork,
                "--clone=false"
            ]);
        } finally {
            process.chdir(cwd);
        }
    } else {
        log(`Fork for repo ${repoToFork} already exists...`);
    }
}

export async function createPullRequest(git: SimpleGit, gitRoot: string, title: string, body: string, targetRepo: string, targetBranch) {
    let status = await git.status();
    let branchName = status.current;

    let cwd = process.cwd();
    try {
        process.chdir(path.resolve(gitRoot));

        log(`Creating Pull Request for ${branchName}`);

        await execFile("gh", [
            "pr",
            "create",
            "--title", title,
            "--fill",
            "--repo", targetRepo,
            "--base", targetBranch
        ]);
    } finally {
        process.chdir(cwd);
    }
}
