import * as fs from "fs";
import * as path from "path";

export function dumpObj(object: any): string {
    const objectTypeDump: string = Object.prototype.toString.call(object);
    let propertyValueDump: string = "";
    if (objectTypeDump === "[object Error]") {
        propertyValueDump = "{\n  name: '" + object.name + "',\n  message: '" + object.message + "',\n  stack: '" + object.stack + "'\n}";
    } else {
        propertyValueDump = JSON.stringify(object);
    }

    if (object.task) {
        propertyValueDump += "\n task details: " + JSON.stringify(object.task, null, 4);
    }

    return objectTypeDump + propertyValueDump;
}

export function log(message: string) {
    console.log(message);
}

export function formatIndentLines(indent: number, value: string, maxLength: number = -1) {
    let srcLines = value.split("\n");
    let lines: string[] = [];

    if (maxLength > 0) {
        let maxLen = maxLength;
        let lp = 0; 
        while (lp < srcLines.length) {
            let theLine = srcLines[lp].trim();
            if (theLine.length > maxLen) {
                // Line is too large, so lets try and split it
                let pos = maxLen;
    
                // Try and find the last space
                while (pos > 0 && theLine[pos] !== ' ') {
                    pos--;
                }
    
                if (pos === 0) {
                    pos = maxLen;
                }
                srcLines[lp] = theLine.substring(pos).trim();
                theLine = theLine.substring(0, pos);
                if (srcLines[lp].length > 0) {
                    lp--;
                }
            }
    
            // Add the new line
            lines.push(theLine);
    
            // Set future lengths
            maxLen = maxLength - indent;
            lp++;
        }
    } else {
        lines = srcLines;
    }

    let result = lines[0] || "";
    for (let lp = 1; lp < lines.length; lp++) {
        result += "\n".padEnd(indent + 1) + lines[lp]
    }

    return result;
}

export function findCurrentRepoRoot() {
    let depth = 10;
    let thePath = ".";

    do {
        if (fs.existsSync(thePath + "/.git")) {
            // Remove any current folder steps
            // return thePath.replace(/\.\.\/\.$/, "..");
            return path.resolve(thePath).replace(/\\/, "/");
        }

        thePath = "../" + thePath;
        depth--;
    } while (depth > 0);

    return null;
}

