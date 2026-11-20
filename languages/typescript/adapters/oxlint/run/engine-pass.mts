import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { readEngineFindings, unparsedFiles } from '../../../../../shared/engine/engine-rows.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { ENGINE_FINDINGS_FILE } from '../../../preset/eslint-config/react/engine-replay.mts';
import type { OxlintPlan, PlanGroup } from '../plan/oxlint-shapes.mts';

type EnginePass = {
  readonly plan: OxlintPlan;
  readonly projectRoot: string;
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
  readonly directory: string;
};

const ENGINE_RULE_PREFIX = 'testing-library/';
const UTILS_MODULE_SETTING = 'testing-library/utils-module';
const ENGINE_UTILS_MODULE = 'test-utils';

function engineRulesOf(group: PlanGroup): string[] {
  return Object.keys(group.rules).filter((ruleId) => ruleId.startsWith(ENGINE_RULE_PREFIX));
}

function isEngineGroup(group: PlanGroup): boolean {
  return engineRulesOf(group).length > 0;
}

function hasEngineSettings(group: PlanGroup): boolean {
  return fieldOf(group.settings, UTILS_MODULE_SETTING) === ENGINE_UTILS_MODULE;
}

function engineArguments(
  { plan, projectRoot, directory }: EnginePass,
  groups: readonly PlanGroup[],
): { readonly argumentList: string[]; readonly files: string[]; readonly out: string } {
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

export function engineLintEnvironment(pass: EnginePass): Environment {
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
  const unparsed = unparsedFiles(findings);
  const replay = path.join(pass.directory, 'replay.json');
  writeFileSync(
    replay,
    JSON.stringify({
      files: files.filter((file) => !unparsed.has(file)),
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
