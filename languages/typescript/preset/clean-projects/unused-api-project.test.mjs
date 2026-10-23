import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  createCleanProject,
  git,
  readReport,
  runNitpicker,
} from './test-support/clean-project.mjs';

const fixturesRoot = path.join(import.meta.dirname, '../fixtures');
const RULES = new Set(['unused-prop', 'unused-option', 'test-only-export']);
const ANALYZERS = ['--analyzer', 'structure', '--analyzer', 'dead-code'];

function symbols(findings) {
  return findings
    .filter(({ rule }) => RULES.has(rule))
    .map(({ rule, symbol }) => `${rule} ${symbol}`)
    .toSorted();
}

function replaceIn(root, file, [before, after]) {
  const target = path.join(root, file);
  writeFileSync(target, readFileSync(target, 'utf8').replace(before, after));
}

describe('unused props, options and exports in a project', () => {
  const temporaryRoots = [];
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function commitProject(fixture) {
    const root = createCleanProject({
      fixtureRoot: path.join(fixturesRoot, fixture),
      gitTemplateRoot,
      name: fixture,
    });
    temporaryRoots.push(root);
    return root;
  }

  it('reports each prop, option and export nothing in production uses and leaves the rest alone', () => {
    const root = commitProject('unused-api-app');
    runNitpicker(root, ['--all', ...ANALYZERS, '--output', path.join(root, 'reports/snapshot')]);
    const findings = readReport(root, 'reports/snapshot/findings.json');

    expect(symbols(findings)).toEqual([
      'test-only-export formatForTests',
      'unused-option useFetch.timeout',
      'unused-prop Button.loading',
      'unused-prop Button.size',
      'unused-prop Card.subtitle',
      'unused-prop Field.mask',
    ]);
  });

  it('gives each finding its allowed form and the entry that accepts it as fields of the message', () => {
    const root = commitProject('unused-api-app');
    runNitpicker(root, ['--all', ...ANALYZERS, '--output', path.join(root, 'reports/snapshot')]);
    const findings = readReport(root, 'reports/snapshot/findings.json');
    const size = findings.find(
      ({ rule, symbol }) => rule === 'unused-prop' && symbol === 'Button.size',
    );

    expect(size).toMatchObject({
      allowedForm: 'Remove it, or pass it from a real caller (tests and stories do not count).',
      exception: { rule: 'unused-prop', reason: '...' },
      exceptionList: 'exceptions',
    });
    expect(size.exception.paths).toEqual([size.path]);
    expect(size.message).toContain(size.allowedForm);
    expect(size.message).toContain(JSON.stringify(size.exception));
  });

  it('fails a commit only for the props it adds or leaves without a caller', () => {
    const root = commitProject('unused-api-diff');
    replaceIn(root, 'src/main/card.tsx', [
      'footer?: string }',
      'footer?: string; dense?: boolean }',
    ]);
    replaceIn(root, 'src/main/app.tsx', [' footer="done"', '']);
    git(root, 'commit', '-q', '-a', '-m', 'head');
    const output = path.join(root, 'reports/diff');
    const { exitCode } = runNitpicker(root, ['--base', 'HEAD~1', ...ANALYZERS, '--output', output]);

    expect(symbols(readReport(root, 'reports/diff/new-findings.json'))).toEqual([
      'unused-prop Card.dense',
      'unused-prop Card.footer',
    ]);
    expect(exitCode).toBe(1);
  });
});
