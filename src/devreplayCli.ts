import commander = require('commander');
import fs = require('fs');
import path = require('path');

import { fixFromFile, lintFromFile } from './lint';
import { outputLintOuts } from './output';
import { arrayify } from './utils';
import { mineRules, mineRulesDetail } from './addRules';
import { writePatternFile } from './ruleManager';
import { makePatternsFromDetailedDiffs, makePatternsFromDiffs } from './makePatterns';
import { DetailedDiff } from './gitMiner';
import { Pattern } from './patterns';

interface Argv {
    fix?: boolean;
    init?: boolean;
    dir?: boolean;
    out?: string;
    initDetail?: boolean;
    initPatch?: boolean;
    initPatchDetail?: boolean;
}

interface Option {
    short?: string;
    // Commander will camelCase option names.
    name: keyof Argv | 'fix' | 'init' | 'dir' | 'init-detail' | 'init-patch' | 'init-patch-detail';
    type: 'string' | 'boolean' | 'array';
    describe: string; // Short, used for usage message
    message: string; // Long, used for `--help`
}

const options: Option[] = [
    {
        name: 'fix',
        type: 'boolean',
        describe: 'fix the file',
        message: 'fix the file',
    },
    {
        name: 'dir',
        type: 'boolean',
        describe: 'target the directory files',
        message: 'target the directory files'
    },
    {
        name: 'init',
        type: 'boolean',
        describe: 'make rules from recent git changes',
        message: 'make rules from recent git changes'
    },
    {
        name: 'init-detail',
        type: 'boolean',
        describe: 'make detailed rules from recent git changes',
        message: 'make detailed rules from recent git changes'
    },
    {
        name: 'init-patch',
        type: 'boolean',
        describe: 'use patch file to generate pattern',
        message: 'use patch file to generate pattern'
    },
    {
        name: 'init-patch-detail',
        type: 'boolean',
        describe: 'use patch file to generate pattern',
        message: 'use patch file to generate pattern'
    }
];

const cli = {
    async execute() {
        for (const option of options) {
            const commanderStr = optionUsageTag(option) + optionParam(option);
            if (option.type === 'array') {
                commander.option(commanderStr, option.describe, collect, []);
            } else {
                commander.option(commanderStr, option.describe);
            }
        }

        // Hack to get unknown option errors to work. https://github.com/visionmedia/commander.js/pull/121
        const parsed = commander.parseOptions(process.argv.slice(2));
        commander.args = parsed.operands;
        if (parsed.unknown.length !== 0) {
            (commander.parseArgs as (args: string[], unknown: string[]) => void)([], parsed.unknown);
        }
        const argv = commander.opts() as Argv;

        if (
            !(
                argv.init !== undefined ||
                argv.initDetail !== undefined ||
                commander.args.length > 0
            )
        ) {
            console.error('No files specified.');
            return 2;
        }

        let ruleFileName: string | undefined;
        if (argv.init || argv.initDetail) {
            const files = arrayify(commander.args);
            let dirName = './';
            if (files.length > 0) {
                dirName = files[0];
            }

            let logLength = 10;
            if (files.length > 1 && !isNaN(Number(files[1]))) {
                logLength = Number(files[1]);
            }
            if (argv.initDetail) {
                const rules = (await mineRulesDetail(dirName, logLength)).filter(x => x.after.length < 3 && x.before.length < 3);
                writePatternFile(rules, dirName);
            } else{
                const rules = (await mineRules(dirName, logLength)).filter(x => x.after.length === 1 && x.before.length === 1);
                writePatternFile(rules, dirName);
            }

            return 0;
        }

        if (argv.initPatch || argv.initPatchDetail) {
            const files = arrayify(commander.args);
            if (files.length < 1) {
                return 1;
            }
            const patchPath = files[0];
            if (!fs.existsSync(patchPath)) {
                return 1;
            }
            const patchContent = fs.readFileSync(patchPath).toString();
            
            let patterns: Pattern[];
            if (argv.initPatchDetail) {
                const detailedDiff: DetailedDiff = {
                    diff: patchContent,
                    log: {
                        author_name: files[1],
                        message: files[2],
                        hash: files[3],
                    }
                }
                patterns = await makePatternsFromDetailedDiffs([detailedDiff])
            } else {
                patterns = await makePatternsFromDiffs([patchContent])
            }
            const dirName = path.dirname(patchPath)
            writePatternFile(patterns, dirName);
            return 0;
        }

        if (argv.dir) {
            const files = arrayify(commander.args);
            if (files.length >= 2) {
                ruleFileName = files[1];
            }
            const dirName = files[0];
            const fileNames = getAllFiles(dirName);
            let results_length = 0;

            for (const fileName of fileNames) {
                if (argv.fix === true) {
                    const results = fixFromFile(fileName, ruleFileName);
                    console.log(results);
                    return 0;
                } else {
                    const results = lintFromFile(fileName, ruleFileName);
                    console.log(outputLintOuts(results));
                    results_length += results.length;
                }
            }
            return results_length === 0 ? 0 : 1;
        }
        
        const files = arrayify(commander.args);
        const fileName = files[0];
        if (files.length >= 2) {
            ruleFileName = files[1];
        }

        if (argv.fix === true) {
            const results = fixFromFile(fileName, ruleFileName);
            console.log(results);
            return 0;
        } else {
            const results = lintFromFile(fileName, ruleFileName);
            console.log(outputLintOuts(results));
            return results.length === 0 ? 0 : 1;
        }
    }
};

function optionUsageTag({ short, name }: Option) {
    return short !== undefined ? `-${short}, --${name}` : `--${name}`;
}

function optionParam(option: Option) {
    switch (option.type) {
        case 'string':
            return ` [${option.name}]`;
        case 'array':
            return ` <${option.name}>`;
        case 'boolean':
            return '';
        default:
            return '';
    }
}

function collect(val: string, memo: string[]) {
    memo.push(val);

    return memo;
}

function getAllFiles(dirName: string) {
    const dirents = fs.readdirSync(dirName, { withFileTypes: true });
    const filesNames: string[] = [];
    for (const files of dirents) {
        if (files.isDirectory()){
            filesNames.push(...getAllFiles(path.join(dirName, files.name)));
        } else {
            filesNames.push(path.join(dirName, files.name));
        }
    }
    return filesNames;
}

module.exports = cli;
