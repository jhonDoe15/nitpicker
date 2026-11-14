import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  git,
  readReport,
  runNitpicker,
  useCleanProjects,
  viewFindings,
} from './test-support/clean-project.mts';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/test-console-project');

describe('the test-console-project fixture', () => {
  const { createProject } = useCleanProjects(process.env);

  function commitLeakingTimer() {
    const root = createProject({ fixtureRoot, name: 'test-console' });
    const widget = path.join(root, 'src/main/widget.ts');
    writeFileSync(widget, readFileSync(widget, 'utf8').replace('      clearTimeout(timer);\n', ''));
    git(root, process.env, 'add', '-A');
    git(root, process.env, 'commit', '-q', '-m', 'stop clearing the timer');
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
    const newFindings = viewFindings(readReport(root, 'reports/diff/new-findings.json'));

    expect(readReport(root, 'reports/diff/tool-errors.json')).toEqual([]);
    expect(newFindings.map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['test-console', 'test-console-output', 'test/plain.test.ts'],
    ]);
    expect(newFindings[0]?.message).toBe(
      [
        'Tests print new console output: "Warning: state update on an unmounted component" (test "unmounts without leaving work behind").',
        'Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json.',
        'If this is intended, add {"rule":"test-console-output","paths":["test/plain.test.ts"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
    expect(exitCode).toBe(1);
  });
});
