import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import {
  type EngineFinding,
  parsedFiles,
  readEngineFindings,
} from '../../../../../shared/engine/engine-rows.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { ENGINE_FINDINGS_FILE } from '../../../../../shared/engine/engine-findings-file.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../../typed/tooling.mts';
import type { OxlintPlan, PlanGroup } from '../plan/oxlint-shapes.mts';

type EnginePass = {
  readonly plan: OxlintPlan;
  readonly projectRoot: string;
  readonly environment: Environment;
  readonly timeoutMs: number | undefined;
  readonly directory: string;
  readonly requests: EngineRequests;
};

type EngineRequests = {
  readonly engineRuleName: (ruleId: string) => string;
  readonly engineSettings: (request: {
    readonly rules: Readonly<Record<string, unknown>>;
    readonly filename: string;
    readonly chosen: ReadonlySet<string>;
    readonly project: { readonly root: string; readonly environment: Environment };
  }) => string[];
  readonly runsOnEngine: (entry: readonly [string, unknown]) => boolean;
};

const REQUESTS_MODULE = '../../../preset/eslint-plugin/engine/engine-requests.mjs';

function isEngineRequests(value: unknown): value is EngineRequests {
  return ['engineRuleName', 'engineSettings', 'runsOnEngine'].every(
    (name) => typeof fieldOf(value, name) === 'function',
  );
}

async function engineRequests(): Promise<EngineRequests> {
  const loaded: unknown = await import(
    checkoutModuleUrl(new URL(REQUESTS_MODULE, import.meta.url)).href
  );
  if (!isEngineRequests(loaded)) {
    throw new Error(`${REQUESTS_MODULE} does not export the engine requests`);
  }
  return loaded;
}

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

function listedLine(
  { projectRoot, environment, requests }: EnginePass,
  { group, file, chosen }: { group: PlanGroup; file: string; chosen: ReadonlySet<string> },
) {
  const filename = path.join(projectRoot, file);
  const project = { root: projectRoot, environment };
  return [
    filename,
    file,
    ...requests.engineSettings({ rules: group.rules, filename, chosen, project }),
  ].join('\t');
}

function hasEngineSettings(group: PlanGroup): boolean {
  return fieldOf(group.settings, UTILS_MODULE_SETTING) === ENGINE_UTILS_MODULE;
}

function testingLibraryOnEngine(groups: readonly PlanGroup[]): boolean {
  const testGroups = groups.filter((group) => Object.keys(group.rules).some(isTestingLibraryRule));
  return testGroups.length > 0 && testGroups.every(hasEngineSettings);
}

function pluginRulesOnEngine(
  groups: readonly PlanGroup[],
  { engineRuleName, runsOnEngine }: EngineRequests,
): string[] {
  const settings = groups.flatMap((group) => Object.entries(group.rules));
  const named = settings.filter(([ruleId]) => engineRuleName(ruleId) !== ruleId);
  const javascript = new Set(
    named.filter((entry) => !runsOnEngine(entry)).map(([ruleId]) => ruleId),
  );
  return [...new Set(named.map(([ruleId]) => ruleId))].filter((id) => !javascript.has(id));
}

function engineRulesOf(groups: readonly PlanGroup[], requests: EngineRequests): EngineRules {
  const testingLibrary = testingLibraryOnEngine(groups);
  const ruleIds = groups.flatMap((group) => Object.keys(group.rules));
  const library = testingLibrary ? ruleIds.filter(isTestingLibraryRule) : [];
  return {
    ids: [...new Set([...library, ...pluginRulesOnEngine(groups, requests)])].sort(),
    testingLibrary,
  };
}

function engineArguments(
  pass: EnginePass,
  rules: EngineRules,
): { readonly argumentList: string[]; readonly files: string[]; readonly out: string } {
  const { plan, directory } = pass;
  const chosen = new Set(rules.ids);
  const groups = plan.groups.filter((group) =>
    Object.keys(group.rules).some((id) => chosen.has(id)),
  );
  const lines = new Map(
    groups.flatMap((group) =>
      group.files.map((file) => [file, listedLine(pass, { group, file, chosen })] as const),
    ),
  );
  const listed = [...lines].sort(([left], [right]) => left.localeCompare(right));
  const files = listed.map(([file]) => file);
  const list = path.join(directory, 'files.tsv');
  const out = path.join(directory, 'findings.json');
  writeFileSync(list, listed.map(([, line]) => `${line}\n`).join(''));
  const scope = rules.testingLibrary ? ['--testing-library-scope'] : [];
  const endToEnd = plan.endToEndRoot === undefined ? [] : ['--end-to-end-root', plan.endToEndRoot];
  return {
    argumentList: [
      'typescript-lint',
      '--files',
      list,
      '--rules',
      rules.ids.map(pass.requests.engineRuleName).join(','),
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
  const rules = engineRulesOf(pass.plan.groups, pass.requests);
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
      findings: findings.map(replayRow),
    }),
  );
  return { ...pass.environment, [ENGINE_FINDINGS_FILE]: replay };
}

function replayRow({ file, rule, line, column, message, end, conditions }: EngineFinding) {
  const ends = end === undefined ? [undefined, undefined] : [end.line, end.column];
  return [
    file,
    rule,
    line,
    column,
    message,
    ...ends,
    ...(conditions === undefined ? [] : [conditions]),
  ];
}

export async function withEngineLint<Result>(
  pass: Omit<EnginePass, 'directory' | 'requests'>,
  lint: (environment: Environment) => Promise<Result>,
): Promise<Result> {
  const requests = await engineRequests();
  const directory = trackTemporaryPath(
    await mkdtemp(path.join(tmpdir(), 'nitpicker-engine-lint-')),
  );
  try {
    return await lint(engineLintEnvironment({ ...pass, directory, requests }));
  } finally {
    await rm(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}
