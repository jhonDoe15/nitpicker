import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaRelease, scopedRuleset, writeGuardRulesets } from './pmd-rulesets.mjs';

const roots = [];
const tests = path.join('/work', 'my.app', 'src', 'test', 'java');
const quoted = String.raw`/work/my\.app/src/test/java/`;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('scopedRuleset', () => {
  it('keeps a ruleset off the given directories and leaves out skipped rules', () => {
    expect(
      scopedRuleset('nitpicker-guards-main', '/rules/guards.xml', {
        directories: [tests],
        skipped: ['InstanceofThenCast', 'CollectorsToList'],
      }),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="nitpicker-guards-main" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>nitpicker-guards-main</description>',
        `  <exclude-pattern>${quoted}.*</exclude-pattern>`,
        '  <rule ref="/rules/guards.xml">',
        '    <exclude name="InstanceofThenCast"/>',
        '    <exclude name="CollectorsToList"/>',
        '  </rule>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });

  it('runs a ruleset only on the given directories', () => {
    expect(
      scopedRuleset('nitpicker-test-honesty', '/rules/honesty.xml', {
        directories: [tests],
        onlyThere: true,
      }),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="nitpicker-test-honesty" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>nitpicker-test-honesty</description>',
        '  <exclude-pattern>.*</exclude-pattern>',
        `  <include-pattern>${quoted}.*</include-pattern>`,
        '  <rule ref="/rules/honesty.xml"/>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });
});

describe('javaRelease', () => {
  it.each([
    [{ release: '17', target: '11', args: [] }, 17],
    [{ target: '1.8', args: [] }, 8],
    [{ target: '11', args: [] }, 11],
    [{ args: [] }, 8],
    [{ target: '11', args: ['--release', '17'] }, 17],
    [{ args: ['--release=21'] }, 21],
    [{ target: '11', args: ['-target', '1.8'] }, 8],
    [{ target: '${java.version}', args: [] }, 8],
  ])('reads %o as Java %i', (compiler, release) => {
    expect(javaRelease(compiler)).toBe(release);
  });
});

describe('writeGuardRulesets', () => {
  it('creates the report directory and writes the guard rulesets, with honesty only for existing tests', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-rulesets-'));
    roots.push(root);
    const test = path.join(root, 'src/test/java');
    mkdirSync(test, { recursive: true });
    const reportDir = path.join(root, 'report', 'nested');

    const rulesets = writeGuardRulesets({
      reportDir,
      testDirectories: [test, path.join(root, 'missing')],
      compiler: { target: '21', args: [] },
    });

    expect(rulesets).toEqual([
      path.join(reportDir, 'pmd-guards-main.xml'),
      path.join(reportDir, 'pmd-test-honesty.xml'),
    ]);
    expect(readFileSync(rulesets[1], 'utf8')).toContain(`<include-pattern>`);
  });

  it('writes only the main guards when no test directory exists', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-rulesets-'));
    roots.push(root);

    const rulesets = writeGuardRulesets({
      reportDir: path.join(root, 'report'),
      testDirectories: [path.join(root, 'missing')],
      compiler: { target: '8', args: [] },
    });

    expect(rulesets).toEqual([path.join(root, 'report', 'pmd-guards-main.xml')]);
    expect(readFileSync(rulesets[0], 'utf8')).toContain('<exclude name="InstanceofThenCast"/>');
  });
});
