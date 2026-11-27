import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_FINDINGS_FILE } from '../../../../../shared/engine/engine-findings-file.mts';
import type { OxlintPlan, PlanGroup } from '../plan/oxlint-shapes.mts';
import { createProject } from '../test-support/oxlint-project.mts';
import { removedAfterAll, writeStubEngine } from '../test-support/engine-stub.mts';
import { type TypedCoverage, withEngineLint, withTypedCoverage } from './engine-pass.mts';
import { residualResults } from './residual-run.mts';

const TYPED_RULE = 'nitpicker/no-mutating-method-in-domain';
const PLAIN_RULE = 'nitpicker/no-silent-catch';

const root = createProject('nitpicker-engine-lint-', {
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
  'src/a.ts': 'export const a = 1;\n',
  'src/b.ts': 'export const b = 1;\n',
});
removedAfterAll(root);

const argumentsFile = path.join(root, 'stub-arguments.txt');
const listFile = path.join(root, 'stub-files.tsv');
const stub = writeStubEngine(
  root,
  [
    ['src/a.ts', PLAIN_RULE, 1, 1, 'silent', 1, 9, [['kind', 'value']]],
    ['src/b.ts', TYPED_RULE, 2, 3, 'mutates'],
  ],
  { argumentsFile, listFile },
);

const typedPlan: OxlintPlan = {
  groups: [
    { files: ['src/a.ts', 'src/b.ts'], rules: { [TYPED_RULE]: 'error', [PLAIN_RULE]: 'error' } },
  ],
  noInlineConfig: [],
  typedPluginRules: [TYPED_RULE],
  ruleMessages: {},
  nativeRules: [],
};

function enginePass(projectConfigPath: string | undefined) {
  return {
    plan: typedPlan,
    projectRoot: root,
    projectConfigPath,
    environment: { ...process.env, NITPICKER_ENGINE: stub },
    timeoutMs: undefined,
  };
}

describe.skipIf(process.platform === 'win32')('the engine lint pass', () => {
  it('runs typed plugin rules on the engine with the project types and replays the findings', async () => {
    const { coverage, replay } = await withEngineLint(
      enginePass(path.join(root, 'tsconfig.json')),
      ({ environment, coverage }) =>
        Promise.resolve({
          coverage,
          replay: readFileSync(String(environment[ENGINE_FINDINGS_FILE]), 'utf8'),
        }),
    );
    const engineArguments = readFileSync(argumentsFile, 'utf8').trim().split(' ');

    expect(engineArguments[engineArguments.indexOf('--rules') + 1]).toBe(
      'no-mutating-method-in-domain,no-silent-catch',
    );
    expect(engineArguments[engineArguments.indexOf('--project') + 1]).toBe(
      path.join(root, 'tsconfig.json'),
    );
    expect(engineArguments).toContain('--compiler');
    expect(coverage).toEqual({
      rules: new Set([TYPED_RULE]),
      files: new Set(['src/a.ts', 'src/b.ts']),
    });
    expect(replay.split('\n')).toEqual(
      expect.arrayContaining([
        JSON.stringify([
          'finding',
          ['src/a.ts', PLAIN_RULE, 1, 1, 'silent', 1, 9, [['kind', 'value']]],
        ]),
        JSON.stringify(['finding', ['src/b.ts', TYPED_RULE, 2, 3, 'mutates', null, null]]),
      ]),
    );
  });

  it('keeps typed plugin rules off the engine when the project has no types to give', async () => {
    const { coverage } = await withEngineLint(
      enginePass(path.join(root, 'missing.json')),
      (engine) => Promise.resolve(engine),
    );
    const engineArguments = readFileSync(argumentsFile, 'utf8').trim().split(' ');

    expect(engineArguments[engineArguments.indexOf('--rules') + 1]).toBe('no-silent-catch');
    expect(engineArguments).not.toContain('--compiler');
    expect(coverage.rules.size).toBe(0);
  });
});

describe('plans split by what the engine typed', () => {
  const group = (files: readonly string[], programRules?: readonly string[]): PlanGroup => ({
    files,
    rules: { [TYPED_RULE]: 'error', [PLAIN_RULE]: 'error' },
    ...(programRules === undefined ? {} : { programRules }),
  });
  const plan = (groups: readonly PlanGroup[]): OxlintPlan => ({ ...typedPlan, groups });
  const coverage: TypedCoverage = { rules: new Set([TYPED_RULE]), files: new Set(['a.ts']) };

  it('keeps the plan when the engine typed no rule', () => {
    const unchanged = plan([group(['a.ts'])]);
    expect(withTypedCoverage(unchanged, { rules: new Set(), files: new Set() })).toBe(unchanged);
  });

  it('moves the typed rules onto the program for the files the engine did not type', () => {
    const split = withTypedCoverage(
      plan([group(['a.ts', 'b.ts'], ['other']), group(['c.ts']), group(['a.ts'])]),
      coverage,
    );

    expect(split.groups).toEqual([
      group(['a.ts'], ['other']),
      group(['b.ts'], ['other', TYPED_RULE]),
      group(['c.ts'], [TYPED_RULE]),
      group(['a.ts']),
    ]);
    expect(split.typedPluginRules).toEqual([]);
  });

  it('keeps a group with no typed rule as it is', () => {
    const plain: PlanGroup = { files: ['a.ts'], rules: { [PLAIN_RULE]: 'error' } };
    expect(withTypedCoverage(plan([plain]), coverage).groups).toEqual([plain]);
  });
});

describe('the residual ESLint pass beside the engine', () => {
  const residual = [{ files: ['src/a.ts'], rules: [PLAIN_RULE] }];
  const reported = [
    {
      filePath: path.join(root, 'src/a.ts'),
      messages: [
        { ruleId: PLAIN_RULE, message: 'kept', severity: 2, line: 1, column: 1 },
        { ruleId: TYPED_RULE, message: 'not asked for', severity: 2, line: 1, column: 1 },
        { message: 'no rule', severity: 2, line: 1, column: 1 },
      ],
    },
  ];

  async function environmentOf(replay: string | undefined) {
    const seen: Readonly<Record<string, string>>[] = [];
    const results = await residualResults(root, residual, {
      runEslintCli: (_files, environment = {}) => {
        seen.push(environment);
        return Promise.resolve(reported);
      },
      replay,
    });
    return { results, environment: seen[0] };
  }

  it('hands the engine replay to ESLint and keeps only the asked rules', async () => {
    const { results, environment } = await environmentOf('/tmp/replay.jsonl');

    expect(environment).toEqual({
      NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify([PLAIN_RULE]),
      [ENGINE_FINDINGS_FILE]: '/tmp/replay.jsonl',
    });
    expect(results).toEqual([{ filePath: 'src/a.ts', messages: [reported[0]?.messages[0]] }]);
  });

  it('runs ESLint without a replay when the engine found nothing', async () => {
    const { environment } = await environmentOf(undefined);
    expect(environment).toEqual({ NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify([PLAIN_RULE]) });
  });
});
