import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, reportRootPattern, toolCommand } from './tool-commands.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('toolCommand', () => {
  it('runs CPD through the launcher and accepts only a clean exit with a CPD report', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-commands-'));
    roots.push(root);
    const report = path.join(root, 'cpd.xml');
    const command = toolCommand('cpd', { report, directories: ['/p/src/main/java', '/p/test'] });
    const missing = command.accepts(0);
    writeFileSync(report, '<html/>');
    const foreign = command.accepts(0);
    writeFileSync(report, '<?xml version="1.0"?>\n<pmd-cpd/>\n');

    expect({
      launcher: command.launcher,
      args: command.args,
      accepted: [missing, foreign, command.accepts(0), command.accepts(1), command.accepts(4)],
    }).toEqual({
      launcher: path.join(import.meta.dirname, '..', '..', 'gradle', 'CpdReport.java'),
      args: [report, '/p/src/main/java', '/p/test'],
      accepted: [false, false, true, false, false],
    });
  });

  it('rejects a CPD report path that is a directory instead of failing on it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-commands-'));
    roots.push(root);
    const report = path.join(root, 'cpd.xml');
    mkdirSync(report);

    expect(toolCommand('cpd', { report, directories: [] }).accepts(0)).toBe(false);
  });

  it('gives the readers the root element a CPD report must have', () => {
    expect(
      ['<pmd-cpd>', '<pmd-cpd/>', '<pmd-cpd\n', '<pmd-cpdx>', '<html>'].map((text) =>
        reportRootPattern('cpd').test(text),
      ),
    ).toEqual([true, true, true, false, false]);
  });

  it('joins the forbiddenapis libraries with the path separator', () => {
    const command = toolCommand('forbiddenapis', {
      classDirectories: ['/p/classes', '/p/kotlin'],
      libraries: ['/l/a.jar', '/l/b.jar'],
      signatures: '/rules/forbidden-apis.txt',
    });

    expect(command.args).toEqual([
      '-d',
      '/p/classes',
      '-d',
      '/p/kotlin',
      '-c',
      ['/l/a.jar', '/l/b.jar'].join(path.delimiter),
      '-f',
      '/rules/forbidden-apis.txt',
      '--allowmissingclasses',
    ]);
    expect([0, 1, 2].map((status) => command.accepts(status))).toEqual([true, true, false]);
  });

  it('accepts a PMD run by its report, whatever its exit', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-commands-'));
    roots.push(root);
    const values = {
      report: path.join(root, 'pmd.sarif'),
      rulesets: ['/r/main.xml', '/r/tests.xml'],
      auxClasspath: '/r/aux.txt',
      directories: ['/p/main', '/p/test'],
    };
    const command = toolCommand('pmd', values);
    const missing = command.accepts(4);
    writeFileSync(values.report, '{}');

    expect(command.args).toEqual([
      'check',
      '--no-cache',
      '--no-progress',
      '--format',
      'sarif',
      '--report-file',
      values.report,
      '--rulesets',
      '/r/main.xml,/r/tests.xml',
      '--aux-classpath',
      'file:/r/aux.txt',
      '--suppress-marker',
      'NITPICKER-NO-INLINE-SUPPRESSION',
      '--dir',
      '/p/main,/p/test',
    ]);
    expect([missing, command.accepts(4), command.accepts(1)]).toEqual([false, true, true]);
  });

  it('lists the jdeps class directories last and accepts only a clean exit', () => {
    const command = toolCommand('jdeps', { classDirectories: ['/p/classes'] });

    expect(command.args).toEqual(['-verbose:class', '-filter:none', '/p/classes']);
    expect([0, 1].map((status) => command.accepts(status))).toEqual([true, false]);
  });
});

describe('the tool-commands command line', () => {
  it.each([
    [
      'cpd',
      { report: '/r/cpd.xml', directories: ['/p/main'] },
      {
        launcher: path.join(import.meta.dirname, '..', '..', 'gradle', 'CpdReport.java'),
        args: ['/r/cpd.xml', '/p/main'],
        accept: { exits: [0], report: '/r/cpd.xml', reportPattern: String.raw`<pmd-cpd[\s/>]` },
      },
    ],
    [
      'forbiddenapis',
      { classDirectories: ['/p/classes'], libraries: ['/l/a.jar'], signatures: '/s.txt' },
      {
        args: ['-d', '/p/classes', '-c', '/l/a.jar', '-f', '/s.txt', '--allowmissingclasses'],
        accept: { exits: [0, 1] },
      },
    ],
    [
      'jdeps',
      { classDirectories: ['/p/classes'] },
      { args: ['-verbose:class', '-filter:none', '/p/classes'], accept: { exits: [0] } },
    ],
  ])(
    'writes the %s command line and what it accepts for the Gradle tasks',
    (tool, values, spec) => {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-tool-commands-'));
      roots.push(root);
      writeFileSync(path.join(root, 'values.json'), JSON.stringify(values));

      main([tool, path.join(root, 'values.json'), path.join(root, 'command.json')]);

      expect(JSON.parse(readFileSync(path.join(root, 'command.json'), 'utf8'))).toEqual(spec);
    },
  );
});
