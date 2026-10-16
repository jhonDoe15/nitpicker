import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { toolCommand } from './tool-commands.mjs';

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
