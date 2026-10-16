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
  it('puts each directory of a CPD run after its own flag and accepts the findings exit', () => {
    const command = toolCommand('cpd', { directories: ['/p/src/main/java', '/p/src/test/java'] });

    expect(command.args).toEqual([
      'cpd',
      '--minimum-tokens',
      '100',
      '--ignore-identifiers',
      '--ignore-literals',
      '--language',
      'java',
      '--format',
      'xml',
      '--no-fail-on-error',
      '--dir',
      '/p/src/main/java',
      '--dir',
      '/p/src/test/java',
    ]);
    expect([0, 1, 4, 5].map((status) => command.accepts(status))).toEqual([
      true,
      false,
      true,
      false,
    ]);
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
