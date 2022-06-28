
export interface SwitchBase {
    showHelp?: boolean;
}

export interface SwitchOptions<T extends SwitchBase> {
    minArgs?: number;
    minValues?: number;
    maxValues?: number;
    switches?: { [key in keyof T]: boolean };
    defaults?: {
        values?: string[];
        switches?: T
    }
}

export interface ParsedOptions<T extends SwitchBase> {
    name?: string;
    failed?: boolean;
    errors?: string[];
    values: string[];
    switches: T
}

function _addError<T extends SwitchBase>(options: ParsedOptions<T>, message: string) {
    options.failed = true;
    options.errors.push(message);
}

export function parseArgs<T extends SwitchBase>(options: SwitchOptions<T>) {
    let parsed: ParsedOptions<T> = {
        name: process.argv[1],
        failed: false,
        errors: [],
        values: (options.defaults || {}).values || [],
        switches: (options.defaults || {}).switches || {} as T
    };

    if (options.minArgs === undefined) {
        options.minArgs = 0;
    }

    if (options.minValues === undefined) {
        options.minValues = 0;
    }

    if (options.maxValues === undefined) {
        options.maxValues = 0;
    }

    if (process.argv.length < (2 + options.minArgs)) {
        _addError(parsed, "!!! Invalid number of arguments -- " + process.argv.length);
        return parsed;
    }

    let pos = 0;
    let idx = 2;
    while(idx < process.argv.length) {
        let theArg = process.argv[idx];
        if (theArg.startsWith("-") || theArg.startsWith("/")) {
            let switchArg = theArg.substring(1);
            if (switchArg === "?" || switchArg === "help") {
                parsed.switches.showHelp = true;
                return parsed;
            } else if (options.switches && options.switches[switchArg] !== undefined) {
                if (options.switches[switchArg]) {
                    if ((idx + 1) < process.argv.length) {
                        parsed.switches[switchArg] = process.argv[idx + 1];
                        idx++;
                    } else {
                        _addError(parsed, `Missing argument after switch -${switchArg}`);
                        break;
                    }
                } else {
                    parsed.switches[switchArg] = true;
                }
            } else {
                _addError(parsed, "Unknown switch [" + theArg + "]");
                break;
            }
        } else {
            if (options.maxValues === undefined || parsed.values.length < options.maxValues) {
                if (pos < parsed.values.length) {
                    parsed.values.push(theArg);
                } else {
                    parsed.values[pos] = theArg;
                }
            } else {
                _addError(parsed, "Unrecognized or too many arguments [" + theArg + "]");
                break;
            }

            pos++;
        }

        idx ++;
    }

    if (!parsed.failed && options.minValues > 0 && parsed.values.length < options.minValues) {
        _addError(parsed, `Wrong number of arguments, expected at least ${options.minValues}`);
    }

    return parsed;
}

