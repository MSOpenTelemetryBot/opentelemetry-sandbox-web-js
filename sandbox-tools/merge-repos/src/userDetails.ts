import { SimpleGit } from "simple-git";
import { getRemoteList } from "./remotes";
import { log } from "./utils";

export interface UserDetails {
    name: string;
    email: string;
    user: string;
}

export async function getUser(git: SimpleGit): Promise<UserDetails> {
    let userEmail = (await git.getConfig("user.email")).value;
    let userName = (await git.getConfig("user.name")).value;

    let originUser = "";
    let remotes = await getRemoteList(git);
    if (remotes.origin && remotes.origin.fetch) {
        let remoteFetch = remotes.origin.fetch;
        let idx = remoteFetch.indexOf("github.com/");
        if (idx !== -1) {
            let endIdx = remoteFetch.indexOf("/", idx + 11);
            if (endIdx !== -1) {
                originUser = remoteFetch.substring(idx + 11, endIdx);
            }
        }
    }

    return {
        name: userName,
        email: userEmail,
        user: originUser
    };
}

export async function setUser(git: SimpleGit, userDetails: UserDetails) {
    // Set the user to be the same as the current user
    log(`Setting user.name ${userDetails.name} and email ${userDetails.email}`);
    await git.addConfig("user.email", userDetails.email, false);
    await git.addConfig("user.name", userDetails.name, false);
}
