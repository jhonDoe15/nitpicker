import { appendFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { findingsSchemaErrors } from '../../../../core/diff/comparison/test-support/findings-schema-check.mjs';
import {
  createCleanProject,
  git,
  readReport,
  runNitpicker,
} from './test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/strict-clean');
const RUN_TIMEOUT_MS = 300_000;
const ANALYZERS = ['eslint-lint', 'prettier-format', 'structure', 'dead-code', 'duplicates'];
const STATEMENTS = Array.from({ length: 20 }, (_, index) => `  total += ${String(index + 3)};`);
const ADDED = [
  '',
  'export function widen(value: unknown): string {',
  '      return value as string;',
  '}',
  '',
  'export function long(start: number): number {',
  '  let total = start;',
  ...STATEMENTS,
  '  return total;',
  '}',
  '',
].join('\n');

describe('the findings a TypeScript run writes', () => {
  let root;
  let newFindings;

  beforeAll(() => {
    root = createCleanProject({
      fixtureRoot,
      gitTemplateRoot: createGitTemplate(),
      name: 'findings-schema',
    });
    appendFileSync(path.join(root, 'src/main/features/greeting/domain/greet.ts'), ADDED);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'add code the gate refuses');
    runNitpicker(root, [
      '--base',
      'HEAD~1',
      ...ANALYZERS.flatMap((name) => ['--analyzer', name]),
      '--no-cache',
      '--output',
      path.join(root, 'reports/diff'),
    ]);
    newFindings = readReport(root, 'reports/diff/new-findings.json');
  }, RUN_TIMEOUT_MS);

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('match spec/findings.schema.json, with every kind of field the run fills in', () => {
    const fields = new Set(newFindings.flatMap((finding) => Object.keys(finding)));
    const located = new Set(newFindings.flatMap(({ location = {} }) => Object.keys(location)));

    expect(findingsSchemaErrors(newFindings)).toEqual([]);
    expect(
      ['allowedForm', 'exception', 'exceptionList', 'ratchet'].filter(
        (field) => !fields.has(field),
      ),
    ).toEqual([]);
    expect(located.has('endLine')).toBe(true);
  });
});
