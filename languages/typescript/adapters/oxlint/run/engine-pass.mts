import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import {
  type EngineFinding,
  parsedFiles,
  readEngineFindings,
  typedFiles,
} from '../../../../../shared/engine/engine-rows.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { ENGINE_FINDINGS_FILE } from '../../../../../shared/engine/engine-findings-file.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../../typed/tooling.mts';
import { isFile } from '../../../../../shared/filesystem.mts';
import { nativeCompilerPath } from '../../typed-engine/compiler-binary.mts';
import type { OxlintPlan, PlanGroup } from '../plan/oxlint-shapes.mts';
import { residualRules, typedGroups } from '../plan/typed-groups.mts';

type EnginePass = {
  readonly plan: OxlintPlan;
  readonly projectRoot: string;
  readonly projectConfigPath: string | undefined;
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
  readonly isTypedOnEngine: (ruleId: string) => boolean;
};

export type TypedCoverage = {
  readonly rules: ReadonlySet<string>;
  readonly files: ReadonlySet<string>;
};

type EngineLint = { readonly environment: Environment; readonly coverage: TypedCoverage };

const NO_COVERAGE: TypedCoverage = { rules: new Set(), files: new Set() };

const REQUESTS_MODULE = '../../../preset/eslint-plugin/engine/engine-requests.mjs';

function isEngineRequests(value: unknown): value is EngineRequests {
  return ['engineRuleName', 'engineSettings', 'runsOnEngine', 'isTypedOnEngine'].every(
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
  readonly types: TypesSource | undefined;
  readonly typedFiles: ReadonlySet<string>;
};

const TYPED_SWITCH = 'NITPICKER_TYPED_LINT_ENGINE';

type TypesSource = { readonly compiler: string; readonly project: string };

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

function typesSource({ projectRoot, projectConfigPath }: EnginePass): TypesSource | undefined {
  const compiler = nativeCompilerPath();
  const project = projectConfigPath ?? path.join(projectRoot, 'tsconfig.json');
  return compiler === undefined || !isFile(project) ? undefined : { compiler, project };
}

function engineRulesOf(pass: EnginePass): EngineRules {
  const { plan, requests } = pass;
  const testingLibrary = testingLibraryOnEngine(plan.groups);
  const ruleIds = plan.groups.flatMap((group) => Object.keys(group.rules));
  const library = testingLibrary ? ruleIds.filter(isTestingLibraryRule) : [];
  const plugin = pluginRulesOnEngine(plan.groups, requests);
  const groups = typedGroups(
    plan,
    pass.environment[TYPED_SWITCH],
    new Set(plugin.filter(requests.isTypedOnEngine)),
  );
  const wanted = new Set(groups.flatMap((group) => residualRules(plan, group)));
  const types = wanted.size > 0 ? typesSource(pass) : undefined;
  const usable = plugin.filter(
    (ruleId) => !requests.isTypedOnEngine(ruleId) || (types !== undefined && wanted.has(ruleId)),
  );
  return {
    ids: [...new Set([...library, ...usable])].sort(),
    testingLibrary,
    types,
    typedFiles: new Set(types === undefined ? [] : groups.flatMap((group) => group.files)),
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
  const types =
    rules.types === undefined
      ? []
      : ['--compiler', rules.types.compiler, '--project', rules.types.project];
  return {
    argumentList: [
      'typescript-lint',
      '--files',
      list,
      '--rules',
      rules.ids.map(pass.requests.engineRuleName).join(','),
      ...scope,
      ...endToEnd,
      ...types,
      '--out',
      out,
    ],
    files,
    out,
  };
}

function engineLint(pass: EnginePass): EngineLint {
  const unchanged = { environment: pass.environment, coverage: NO_COVERAGE };
  const rules = engineRulesOf(pass);
  const binary = findEngine(pass.environment);
  if (binary === undefined || rules.ids.length === 0) {
    return unchanged;
  }
  const { argumentList, files, out } = engineArguments(pass, rules);
  const run = runEngineSync(argumentList, { binary, timeoutMs: pass.timeoutMs });
  if (run.status !== 0) {
    return unchanged;
  }
  const findings = readEngineFindings(out);
  const typed = rules.ids.filter(pass.requests.isTypedOnEngine);
  const covered = typedFiles(files, findings).filter((file) => rules.typedFiles.has(file));
  const replay = path.join(pass.directory, 'replay.json');
  writeFileSync(
    replay,
    JSON.stringify({
      files: parsedFiles(files, findings),
      rules: rules.ids,
      typedFiles: covered,
      typedRules: typed,
      findings: findings.map(replayRow),
    }),
  );
  return {
    environment: { ...pass.environment, [ENGINE_FINDINGS_FILE]: replay },
    coverage: { rules: new Set(typed), files: new Set(covered) },
  };
}

function splitByCoverage(group: PlanGroup, coverage: TypedCoverage): PlanGroup[] {
  const covered = Object.keys(group.rules).filter((ruleId) => coverage.rules.has(ruleId));
  if (covered.length === 0) {
    return [group];
  }
  const outside = group.files.filter((file) => !coverage.files.has(file));
  return [
    { ...group, files: group.files.filter((file) => coverage.files.has(file)) },
    { ...group, files: outside, programRules: [...(group.programRules ?? []), ...covered] },
  ].filter((part) => part.files.length > 0);
}

export function withTypedCoverage(plan: OxlintPlan, coverage: TypedCoverage): OxlintPlan {
  return coverage.rules.size === 0
    ? plan
    : {
        ...plan,
        groups: plan.groups.flatMap((group) => splitByCoverage(group, coverage)),
        typedPluginRules: plan.typedPluginRules.filter((ruleId) => !coverage.rules.has(ruleId)),
      };
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
  lint: (engine: EngineLint) => Promise<Result>,
): Promise<Result> {
  const requests = await engineRequests();
  const directory = trackTemporaryPath(
    await mkdtemp(path.join(tmpdir(), 'nitpicker-engine-lint-')),
  );
  try {
    return await lint(engineLint({ ...pass, directory, requests }));
  } finally {
    await rm(directory, { recursive: true, force: true });
    untrackTemporaryPath(directory);
  }
}
