import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../tooling/tool-resolution.mjs';
import {
  collectArchitectureSignals as collectArchitectureSignalsJs,
  collectSignals as collectSignalsJs,
} from '../../../../languages/typescript/preset/coding-standards/check.mjs';
import { configuredAnalyzers as configuredAnalyzersJs } from '../../../../languages/typescript/preset/diff/configured-analyzers.mjs';
import {
  resolveHeadPolicy as resolveHeadPolicyJs,
  withHeadPolicyFile as withHeadPolicyFileJs,
} from '../../../../languages/typescript/preset/head-policy.mjs';
import { compareFindings } from '../../comparison/test-support/typed-compare.mts';
import { type AnalyzerRequest, runAnalyzers } from '../../execution/run-analyzers.mts';
import type { Finding } from '../../../../shared/values/findings.mts';

type Signal = {
  readonly file: string;
  readonly rule: string;
  readonly source: string;
  readonly message: string;
};

const configuredAnalyzers: () => { readonly name: string }[] = configuredAnalyzersJs;
const collectSignals: (root: string, policyRoot: string) => Promise<Signal[]> = collectSignalsJs;
const collectArchitectureSignals: (root: string, layout: undefined) => Signal[] =
  collectArchitectureSignalsJs;
const resolveHeadPolicy: (config: object, projectRoot: undefined) => object = resolveHeadPolicyJs;
const withHeadPolicyFile: <T>(policy: object, run: (policyFile: string) => T) => T =
  withHeadPolicyFileJs;
const packageAnalyzers = configuredAnalyzers();
const LOST_CAUSE = [
  'Preserve the original cause when wrapping a caught failure: `new AppError(message, { cause: error })`.',
  ' An exception fits only when the original failure is deliberately dropped.',
].join('');
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it('compares both sides using the head coding inventory when that inventory entry is removed', async () => {
  const baseProjectRoot = createSnapshotRoot();
  const headProjectRoot = createSnapshotRoot();
  writeProject(baseProjectRoot);
  writeProject(headProjectRoot);

  const legacySignals = [
    ...(await collectSignals(baseProjectRoot, PACKAGE_ROOT)),
    ...collectArchitectureSignals(baseProjectRoot, undefined),
  ];
  expect(legacySignals).toEqual([
    {
      file: 'src/main/legacy.ts',
      rule: 'nitpicker/preserve-error-cause',
      source: 'new Error(String(error))',
      message: LOST_CAUSE,
    },
  ]);
  writeFileSync(
    path.join(baseProjectRoot, 'nitpicker.legacy.json'),
    `${JSON.stringify({ sites: legacySignals.map((site) => ({ ...site, count: 1 })) })}\n`,
  );

  const analyzer = packageAnalyzers.find(({ name }) => name === 'coding-standards');
  const baseRun = runAnalyzers(
    analyzerRequest({
      analyzers: [analyzer],
      projectRoot: baseProjectRoot,
      policyRoot: headProjectRoot,
      snapshot: 'base',
    }),
  );
  const headRun = runAnalyzers(
    analyzerRequest({
      analyzers: [analyzer],
      projectRoot: headProjectRoot,
      policyRoot: headProjectRoot,
      snapshot: 'head',
      baselineRoot: baseProjectRoot,
    }),
  );
  const comparison = compareFindings({
    baseFindings: baseRun.reports.get('coding-standards')?.findings ?? [],
    headFindings: headRun.reports.get('coding-standards')?.findings ?? [],
  });

  expect(baseRun.toolErrors).toEqual([]);
  expect(headRun.toolErrors).toEqual([]);
  expect(comparison.newFindings).toEqual([]);
  expect(comparison.unchangedFindings).toEqual([
    {
      tool: 'coding-standards',
      rule: 'nitpicker/preserve-error-cause',
      path: 'src/main/legacy.ts',
      identity: 'source:2b12a180517391cf91a57a1f|count:1',
      message: LOST_CAUSE,
      classification: 'enforceable',
    },
  ]);
});

function analyzerRequest(
  overrides: Pick<AnalyzerRequest, 'analyzers' | 'projectRoot' | 'policyRoot' | 'snapshot'> &
    Partial<AnalyzerRequest>,
): AnalyzerRequest {
  return {
    toolRoot: PACKAGE_ROOT,
    liveProjectRoot: PACKAGE_ROOT,
    baselineRoot: undefined,
    baselineMovesFile: undefined,
    headPolicyFile: undefined,
    mutationScope: undefined,
    logRoot: undefined,
    runTasks: undefined,
    ...overrides,
  };
}

function headFindings(config: object) {
  const projectRoot = createSnapshotRoot();
  writeProject(projectRoot);
  const run = withHeadPolicyFile(resolveHeadPolicy(config, undefined), (headPolicyFile) =>
    runAnalyzers(
      analyzerRequest({
        analyzers: packageAnalyzers.filter(({ name }) => name === 'coding-standards'),
        projectRoot,
        policyRoot: projectRoot,
        snapshot: 'head',
        headPolicyFile,
      }),
    ),
  );
  expect(run.toolErrors).toEqual([]);
  return run.reports
    .get('coding-standards')
    ?.findings.map(({ rule, message }: Finding) => ({ rule, message }));
}

it('reports a new coding-standard site with the rule message', () => {
  expect(headFindings({})).toEqual([
    { rule: 'nitpicker/preserve-error-cause', message: LOST_CAUSE },
  ]);
});

it('lifts a coding-standard site that an exceptions entry lifts for the same rule', () => {
  expect(
    headFindings({
      exceptions: [{ rule: 'nitpicker/preserve-error-cause', paths: ['src/main/legacy.ts'] }],
    }),
  ).toEqual([]);
});

function createSnapshotRoot() {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-coding-inventory-'));
  temporaryRoots.push(temporaryRoot);
  const projectRoot = path.join(temporaryRoot, 'base');
  mkdirSync(projectRoot);
  return projectRoot;
}

function writeProject(root: string) {
  mkdirSync(path.join(root, 'src/main'), { recursive: true });
  writeFileSync(
    path.join(root, 'src/main/legacy.ts'),
    'export function legacy() {\n  try {\n    run();\n  } catch (error) {\n    throw new Error(String(error));\n  }\n}\n',
  );
  mkdirSync(path.join(root, 'tests'), { recursive: true });
  writeFileSync(path.join(root, 'tests/placeholder.ts'), 'export {};\n');
  writeFileSync(
    path.join(root, 'src/main/tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        types: [],
        lib: ['ES2022'],
      },
      include: ['**/*.ts'],
    })}\n`,
  );
}
