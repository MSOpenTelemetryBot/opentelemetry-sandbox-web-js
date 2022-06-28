import simpleGit, { SimpleGit, SimpleGitOptions } from "simple-git";
import { log } from "./utils";

export function createGit(baseDir: string, progressPrefix: string): SimpleGit {
    let lastCompleteMessage: string;
    let options: Partial<SimpleGitOptions> = {
        baseDir: baseDir,
        progress: ({ method, stage, progress, processed, total }) => {
            let message = `${progressPrefix}.${method} ${stage} stage ${processed}/${total} = ${progress}% complete`;
    
            if (progress === 100 || processed === total) {
                if (lastCompleteMessage !== message) {
                    log(message.padEnd(79));
                    lastCompleteMessage = message;
                }
            } else {
                lastCompleteMessage = null;
                process.stdout.write(message.padEnd(79) + "\r");
            }
        }
    };

    return simpleGit(options);
}