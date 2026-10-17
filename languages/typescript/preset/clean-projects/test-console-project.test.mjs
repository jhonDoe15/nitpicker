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

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/test-console-project');

describe('the test-console-project fixture', () => {
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

  function commitLeakingTimer() {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'test-console' });
    temporaryRoots.push(root);
    const widget = path.join(root, 'src/main/widget.ts');
    writeFileSync(widget, readFileSync(widget, 'utf8').replace('      clearTimeout(timer);\n', ''));
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'stop clearing the timer');
    return root;
  }

  it('fails only the test file whose new warning is neither allowed nor excepted', () => {
    const root = commitLeakingTimer();

    const { exitCode } = runNitpicker(root, [
      '--base',
      'HEAD~1',
      '--analyzer',
      'coverage',
      '--analyzer',
      'test-console',
      '--no-cache',
      '--output',
      path.join(root, 'reports/diff'),
    ]);
    const newFindings = readReport(root, 'reports/diff/new-findings.json');

    expect(readReport(root, 'reports/diff/tool-errors.json')).toEqual([]);
    expect(newFindings.map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['test-console', 'test-console-output', 'test/plain.test.ts'],
    ]);
    expect(newFindings[0].message).toBe(
      [
        'Tests print new console output: "Warning: state update on an unmounted component" (test "unmounts without leaving work behind").',
        'Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json.',
        'If this is intended, add {"rule":"test-console-output","paths":["test/plain.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
    expect(exitCode).toBe(1);
  });
});
