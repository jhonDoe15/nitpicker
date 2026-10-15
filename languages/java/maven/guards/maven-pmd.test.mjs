import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { javaRelease, scopedRuleset } from './maven-pmd.mjs';

const tests = path.join('/work', 'my.app', 'src', 'test', 'java');
const quoted = String.raw`/work/my\.app/src/test/java/`;

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
    [{ release: '17', target: '11' }, 17],
    [{ target: '1.8' }, 8],
    [{ target: '11' }, 11],
    [{}, 8],
  ])('reads %o as Java %i', (compiler, release) => {
    expect(javaRelease(compiler)).toBe(release);
  });
});
