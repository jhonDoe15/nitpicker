import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from "../../../../../shared/engine/engine-binary.mjs";
import { parsedFiles, readEngineFindings } from "../../../../../shared/engine/engine-rows.mjs";
import { runEngineSync } from "../../../../../shared/engine/engine-run.mjs";
import { fieldOf } from "../../../../../shared/values/readers.mjs";
import { ENGINE_FINDINGS_FILE } from "../../../preset/eslint-config/react/engine-replay.mjs";
import { trackTemporaryPath, untrackTemporaryPath } from "../../typed/tooling.mjs";
const ENGINE_RULE_PREFIX = 'testing-library/';
const UTILS_MODULE_SETTING = 'testing-library/utils-module';
const ENGINE_UTILS_MODULE = 'test-utils';
function engineRulesOf(group) {
    return Object.keys(group.rules).filter((ruleId) => ruleId.startsWith(ENGINE_RULE_PREFIX));
}
function isEngineGroup(group) {
    return engineRulesOf(group).length > 0;
}
function hasEngineSettings(group) {
    return fieldOf(group.settings, UTILS_MODULE_SETTING) === ENGINE_UTILS_MODULE;
}
function engineArguments({ plan, projectRoot, directory }, groups) {
    const files = [...new Set(groups.flatMap((group) => group.files))].sort();
    const rules = [...new Set(groups.flatMap(engineRulesOf))].sort();
    const list = path.join(directory, 'files.tsv');
    const out = path.join(directory, 'findings.json');
    writeFileSync(list, files.map((file) => `${path.join(projectRoot, file)}\t${file}\n`).join(''));
    const endToEnd = plan.endToEndRoot === undefined ? [] : ['--end-to-end-root', plan.endToEndRoot];
    return {
        argumentList: [
            'typescript-lint',
            '--files',
            list,
            '--rules',
            rules.join(','),
            '--testing-library-scope',
            ...endToEnd,
            '--out',
            out,
        ],
        files,
        out,
    };
}
function engineLintEnvironment(pass) {
    const groups = pass.plan.groups.filter(isEngineGroup);
    const binary = findEngine(pass.environment);
    if (binary === undefined || groups.length === 0 || !groups.every(hasEngineSettings)) {
        return pass.environment;
    }
    const { argumentList, files, out } = engineArguments(pass, groups);
    const run = runEngineSync(argumentList, { binary, timeoutMs: pass.timeoutMs });
    if (run.status !== 0) {
        return pass.environment;
    }
    const findings = readEngineFindings(out);
    const replay = path.join(pass.directory, 'replay.json');
    writeFileSync(replay, JSON.stringify({
        files: parsedFiles(files, findings),
        findings: findings.map(({ file, rule, line, column, message, end }) => [
            file,
            rule,
            line,
            column,
            message,
            ...(end === undefined ? [] : [end.line, end.column]),
        ]),
    }));
    return { ...pass.environment, [ENGINE_FINDINGS_FILE]: replay };
}
export async function withEngineLint(pass, lint) {
    const directory = trackTemporaryPath(await mkdtemp(path.join(tmpdir(), 'nitpicker-engine-lint-')));
    try {
        return await lint(engineLintEnvironment({ ...pass, directory }));
    }
    finally {
        await rm(directory, { recursive: true, force: true });
        untrackTemporaryPath(directory);
    }
}
