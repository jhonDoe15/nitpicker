import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { javaRelease, scopedRuleset, writePmdRulesets } from './pmd-rulesets.mjs';

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

describe('writePmdRulesets', () => {
  it('writes the test-class rule for every directory but the main ones, before the spring wrapper', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-rulesets-'));
    roots.push(root);
    const main = path.join(root, 'src/main/java');
    const test = path.join(root, 'src/test/java');
    mkdirSync(test, { recursive: true });
    const reportDir = path.join(root, 'report');

    const rulesets = writePmdRulesets({
      reportDir,
      mainDirectories: [main],
      testDirectories: [test],
      compiler: { target: '21', args: [] },
      spring: true,
      nitpicker: true,
      project: undefined,
    });

    expect(rulesets).toEqual([
      path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'),
      path.join(reportDir, 'pmd-guards-main.xml'),
      path.join(reportDir, 'pmd-test-honesty.xml'),
      path.join(reportDir, 'pmd-tests.xml'),
      path.join(reportDir, 'pmd-spring-main.xml'),
    ]);
    expect(readFileSync(path.join(reportDir, 'pmd-tests.xml'), 'utf8')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ruleset name="nitpicker-tests" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">',
        '  <description>nitpicker-tests</description>',
        `  <exclude-pattern>${main}/.*</exclude-pattern>`,
        '  <rule ref="category/java/errorprone.xml/TestClassWithoutTestCases">',
        '    <properties>',
        '      <property name="testClassPattern"',
        '                value="^(?:.*\\.)?Test[^\\.]*$|^(?:.*\\.)?.*(?&lt;!Arch|Architecture)Tests?$|' +
          '^(?:.*\\.)?.*TestCase$"/>',
        '    </properties>',
        '  </rule>',
        '</ruleset>',
        '',
      ].join('\n'),
    );
  });
});
