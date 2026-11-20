import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import { runSnapshot, useCleanProjects, viewFindings } from './test-support/clean-project.mts';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/strict-clean');
const FIXTURE_TIMEOUT_MS = 180_000;
const CARRIED = ['eslint-errors', 'eslint-logging', 'eslint-module-effects'];
const NOISY = [
  'const started = new Map<string, number>();',
  "started.set('boot', Date.now());",
  '',
  'export function parse(text: string): unknown {',
  '  try {',
  '    return JSON.parse(text);',
  '  } catch (error) {',
  "    console.error('unreadable');",
  '    return undefined;',
  '  }',
  '}',
  '',
  'export function swallow(text: string): number {',
  '  try {',
  '    return text.length;',
  '  } catch {',
  '    return 0;',
  '  }',
  '}',
  '',
  'export function announce(name: string): void {',
  '  // eslint-disable-next-line nitpicker/no-production-console',
  '  console.log(name);',
  '}',
  '',
].join('\n');
const FILES = { 'src/main/features/greeting/adapters/noisy.ts': NOISY };

function analyzerArguments(names: readonly string[]): string[] {
  return ['--no-cache', ...names.flatMap((name) => ['--analyzer', name])];
}

function carriedFindings(findings: unknown, names: readonly string[] = CARRIED) {
  return viewFindings(findings)
    .filter(({ tool, rule }) => names.includes(tool) && !rule.startsWith('eslint/'))
    .map(({ tool, rule, path: file, location, message }) => ({
      tool,
      rule,
      file,
      line: location['line'],
      message,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function toolNames(summary: unknown): string[] {
  return listOf(fieldOf(summary, 'tools')).map((tool) => textOf(fieldOf(tool, 'name')));
}

describe('eslint-lint carrying the production policy analyzers', () => {
  const { createProject } = useCleanProjects(process.env);

  it(
    'reports the findings the three analyzers report by themselves',
    () => {
      const root = createProject({ fixtureRoot, name: 'strict-clean', files: FILES });

      const alone = runSnapshot(root, analyzerArguments(CARRIED));
      const carried = runSnapshot(root, analyzerArguments(['eslint-lint', ...CARRIED]));

      expect([alone.toolErrors, carried.toolErrors]).toEqual([[], []]);
      expect(carriedFindings(carried.findings)).toEqual(carriedFindings(alone.findings));
      expect([...new Set(carriedFindings(carried.findings).map(({ rule }) => rule))]).toEqual([
        'nitpicker/no-silent-catch',
        'nitpicker/no-production-console',
        'nitpicker/report-module-load-effects',
      ]);
      expect(CARRIED.filter((name) => !toolNames(carried.summary).includes(name))).toEqual([]);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it(
    'leaves out a disabled analyzer',
    () => {
      const root = createProject({
        fixtureRoot,
        name: 'strict-clean',
        files: {
          ...FILES,
          'nitpicker.config.json': '{ "preset": "typescript", "disable": ["eslint-logging"] }\n',
        },
      });

      const { findings, toolErrors, summary } = runSnapshot(root, ['--no-cache']);

      expect(toolErrors).toEqual([]);
      expect(carriedFindings(findings, ['eslint-logging'])).toEqual([]);
      expect([
        ...new Set(carriedFindings(findings, ['eslint-errors']).map(({ rule }) => rule)),
      ]).toEqual(['nitpicker/no-silent-catch']);
      expect(toolNames(summary)).not.toContain('eslint-logging');
    },
    FIXTURE_TIMEOUT_MS,
  );
});
