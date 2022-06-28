import { SimpleGit } from "simple-git";
import { IRepoSyncDetails } from "./types";
import { log } from "./utils";

function getRepoTags(theRepos: IRepoSyncDetails) {
    let theTags: string[] = [];

    Object.keys(theRepos).forEach((key) => {
        theTags.push(theRepos[key].tagPrefix);
    });

    return theTags;
}

function isIgnoreTag(theTag: string, repoTags: string[], prefix: string, ignoreTagPrefixes: string[]) {
    if (theTag.indexOf(prefix) === 0) {
        // Tag starts with the prefix so ignore it
        return true;
    }

    for (let lp = 0; lp < ignoreTagPrefixes.length; lp++) {
        if (theTag.indexOf(ignoreTagPrefixes[lp]) === 0) {
            // Tag starts with the ignoreTagPrefixes so ignore it
            return true;
        }
    }

    for (let lp = 0; lp < repoTags.length; lp++) {
        if (theTag.indexOf(repoTags[lp]) === 0) {
            return true;
        }
    }

    return false;
}

export async function renameTags(theRepos: IRepoSyncDetails, git: SimpleGit, prefix: string, ignoreTagPrefixes: string[]) {
    log(`Renaming Tags ${prefix}`)
    let repoTags = getRepoTags(theRepos);
    
    let tags = await git.tags();
    tags && tags.all.forEach(async (tag) => {
        if (!isIgnoreTag(tag, repoTags, prefix, ignoreTagPrefixes)) {
            let newTagName = prefix + tag;
            if (tags && tags.all.indexOf(newTagName) === -1) {
                log(` - ${tag} => ${prefix + tag}`);
                // rename the tag if the new tagname doesn't exist
                await git.tag([newTagName, tag]);
            }
            // Delete the old tag
            await git.tag(["-d", tag]);
        } else {
            log(` - Ignoring ${tag}`);
        }
    });
}
