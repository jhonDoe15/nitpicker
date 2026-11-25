import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { parsedFiles, readEngineFindings } from '../../../../../shared/engine/engine-rows.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { ENGINE_FINDINGS_FILE } from '../../../preset/eslint-plugin/engine/engine-replay.mts';
import {
  ENGINE_PLUGIN_RULES,
  PLUGIN_RULE_PREFIX,
} from '../../../preset/eslint-plugin/engine/engine-rules.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../../typed/tooling.mts';
import type { OxlintPlan, PlanGroup } from '../plan/oxlint-shapes.mts';

type EnginePass = {
  readonly plan: OxlintPlan;
  readonly projectRoot: string;
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
  readonly directory: string;
};

const TESTING_LIBRARY_PREFIX = 'testing-library/';
const UTILS_MODULE_SETTING = 'testing-library/utils-module';
const ENGINE_UTILS_MODULE = 'test-utils';

type EngineRules = {
  readonly ids: readonly string[];
  readonly testingLibrary: boolean;
};

function isTestingLibraryRule(ruleId: string): boolean {
  return ruleId.startsWith(TESTING_LIBRARY_PREFIX);
}

function pluginRuleName(ruleId: string): string | undefined {
  const name = ruleId.startsWith(PLUGIN_RULE_PREFIX)
    ? ruleId.slice(PLUGIN_RULE_PREFIX.length)
    : undefined;
  return name !== undefined && ENGINE_PLUGIN_RULES.has(name) ? name : undefined;
}

function hasOptions(setting: unknown): boolean {
  return Array.isArray(setting) && setting.length > 1;
}

function hasEngineSettings(group: PlanGroup): boolean {
  return fieldOf(group.settings, UTILS_MODULE_SETTING) === ENGINE_UTILS_MODULE;
}

function testingLibraryOnEngine(groups: readonly PlanGroup[]): boolean {
  const testGroups = groups.filter((group) => Object.keys(group.rules).some(isTestingLibraryRule));
  return testGroups.length > 0 && testGroups.every(hasEngineSettings);
}

function pluginRulesOnEngine(groups: readonly PlanGroup[]): string[] {
  const settings = groups.flatMap((group) => Object.entries(group.rules));
  const named = settings.filter(([ruleId]) => pluginRuleName(ruleId) !== undefined);
  const withOptions = new Set(named.filter(([, setting]) => hasOptions(setting)).map(([id]) => id));
  return [...new Set(named.map(([ruleId]) => ruleId))].filter((id) => !withOptions.has(id));
}

function engineRulesOf(groups: readonly PlanGroup[]): EngineRules {
  const testingLibrary = testingLibraryOnEngine(groups);
  const ruleIds = groups.flatMap((group) => Object.keys(group.rules));
  const library = testingLibrary ? ruleIds.filter(isTestingLibraryRule) : [];
  return {
    ids: [...new Set([...library, ...pluginRulesOnEngine(groups)])].sort(),
    testingLibrary,
  };
}

function engineRuleName(ruleId: string): string {
  return pluginRuleName(ruleId) ?? ruleId;
}

function engineArguments(
  { plan, projectRoot, directory }: EnginePass,
  rules: EngineRules,
): { readonly argumentList: string[]; readonly files: string[]; readonly out: string } {
  const chosen = new Set(rules.ids);
  const groups = plan.groups.filter((group) => Object.keys(group.rules).some((id) => chosen.has(id)));
  const files = [...new Set(groups.flatMap((group) => group.files))].sort();
  const list = path.join(directory, 'files.tsv');
  const out = path.join(directory, 'findings.json');
  writeFileSync(list, files.map((file) => `${path.join(projectRoot, file)}\t${file}\n`).join(''));
  const scope = rules.testingLibrary ? ['--testing-library-scope'] : [];
  const endToEnd = plan.endToEndRoot === undefined ? [] : ['--end-to-end-root', plan.endToEndRoot];
  return {
    argumentList: [
      'typescript-lint',
      '--files',
      list,
      '--rules',
      rules.ids.map(engineRuleName).join(','),
      ...scope,
      ...endToEnd,
      '--out',
      out,
    ],
    files,
    out,
  };
}

function engineLintEnvironment(pass: EnginePass): Environment {
  const rules = engineRulesOf(pass.plan.groups);
  const binary = findEngine(pass.environment);
  if (binary === undefined || rules.ids.length === 0) {
    return pass.environment;
  }
  const { argumentList, files, out } = engineArguments(pass, rules);
  const run = runEngineSync(argumentList, { binary, timeoutMs: pass.timeoutMs });
  if (run.status !== 0) {
    return pass.environment;
  }
  const findings = readEngineFindings(out);
  const replay = path.join(pass.directory, 'replay.json');
  writeFileSync(
    replay,
    JSON.stringify({
      files: parsedFiles(files, findings),
      rules: rules.ids,
      findings: findings.map(({ file, rule, line, column, message, end }) => [
        file,
        rule,
        line,
        column,
        message,
        ...(end === undefined ? [] : [end.line, end.column]),
      ]),
    }),
  );
  return { ...pass.environment, [ENGINE_FINDINGS_FILE]: replay };
}

export async function withEngineLint<Result>(
  pass: Omit<EnginePass, 'directory'>,
  lint: (environment: Environment) => Promise<Result>,
): Promise<Result> {
  const directory = trackTemporaryPath(
    await mkdtemp(path.join(tmpdir(), 'nitpicker-engine-lint-')),
  );
  try {
    return await lint(engineLintEnvironment({ ...pass, directory }));
  } finally {
    await rm(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}
