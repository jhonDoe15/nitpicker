import { ESLint, type Linter } from 'eslint';
import { rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzerReport } from '../../../../../shared/values/findings.mts';
import { normalizeEslintResults } from '../normalize.mts';
import { createProject } from '../../oxlint/test-support/oxlint-project.mts';
import { withSharedUnusedDirectives } from './unused-directives.mts';

const SOURCE = [
  '// eslint-disable-next-line no-debugger',
  'export const clean = true;',
  '// eslint-disable-next-line no-debugger, no-console',
  "console.log('fixture');",
  '// eslint-disable-next-line no-alert, no-debugger, no-console',
  "console.log('fixture'); debugger;",
  '/* eslint-disable */',
  "console.log('fixture');",
].join('\n');
const POLICIES: readonly (readonly [string, Linter.RulesRecord, Linter.LinterOptions])[] = [
  ['eslint-lint', { 'no-alert': 'error' }, { noInlineConfig: true }],
  ['eslint-errors', { 'no-debugger': 'error' }, {}],
  ['eslint-logging', { 'no-console': 'error' }, {}],
];
const analyzers = POLICIES.map(([name]) => ({
  name,
  lintedGlobs: { include: ['src/**/*.ts'], exclude: [] },
}));

let root: string;
let merged: ReturnType<typeof withSharedUnusedDirectives> | undefined;

beforeAll(async () => {
  root = createProject('nitpicker-eslint-shared-directives-', { 'src/a.ts': SOURCE });
  const reports = await Promise.all(
    POLICIES.map(async ([name, rules, linterOptions]): Promise<[string, AnalyzerReport]> => {
      const eslint = new ESLint({
        cwd: root,
        overrideConfigFile: true,
        overrideConfig: [{ files: ['src/**/*.ts'], rules, linterOptions }],
      });
      const value = await eslint.lintFiles(['src/**/*.ts']);
      return [
        name,
        { findings: normalizeEslintResults({ value, projectRoot: root, analyzerName: name }) },
      ];
    }),
  );
  merged = withSharedUnusedDirectives({ reports: new Map(reports) }, analyzers);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('shared directives from real ESLint reports', () => {
  it('reports each globally unused directive or unused part once', () => {
    const findings = [...(merged?.reports.values() ?? [])]
      .flatMap(({ findings }) => findings)
      .filter(({ rule }) => rule === 'eslint/unused-disable-directive');

    expect(
      findings.map(({ tool, location, message }) => ({ tool, line: location?.line, message })),
    ).toEqual([
      {
        tool: 'eslint-errors',
        line: 1,
        message: "Unused eslint-disable directive (no problems were reported from 'no-debugger').",
      },
      {
        tool: 'eslint-errors',
        line: 3,
        message: "Unused eslint-disable directive (no problems were reported from 'no-debugger').",
      },
      {
        tool: 'eslint-errors',
        line: 5,
        message: "Unused eslint-disable directive (no problems were reported from 'no-alert').",
      },
    ]);
  });
});
