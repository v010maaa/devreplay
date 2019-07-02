import { existsSync, readFileSync } from "fs";
import { IPattern, makeBefore } from "./patterns";
import { sources } from "./source";

export async function readPatternFile(langId: string, ruleFileName?: string) {
    const location = ruleFileName &&  existsSync(ruleFileName) ?
    ruleFileName :
    (existsSync("./devreplay.json")) ?
    "devreplay.json" : __dirname + "/../rules/" + sources[langId].path;
    const patternContent = await readFileSync(location).toString();
    const patternJson = JSON.parse(patternContent) as IPattern[];
    return patternJson;
}

export function getTriggarableCode(tokens: string[], patterns: IPattern[]) {
    for (const pattern of patterns) {
        const trigger = makeBefore(pattern.code);
        if (isTriggarable(trigger, tokens)) {
            return pattern;
        }
    }
    return;
}

function isTriggarable(trigger: string[], tokens: string[]) {
    let startPosition = 0;
    for (const trigToken of trigger) {
      let isFound = false;
      for (let index = startPosition; index < tokens.length; index++) {
        const token = tokens[index];
        if (trigToken === token) {
          isFound = true;
          startPosition = index + 1;
        }
      }
      if (!isFound) {
        return false;
      }
    }
    return true;
}
