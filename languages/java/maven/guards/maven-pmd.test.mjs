import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { javaRelease, runPmd, scopedRuleset } from './maven-pmd.mjs';

const roots = [];
const RULESET = 'http://pmd.sourceforge.net/ruleset/2.0.0';
const PMD_RULESET = path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml');
const GUARDS_RULES = path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml');
const HONESTY_RULES = path.join(GRADLE_DIRECTORY, 'rules/test-honesty-ruleset.xml');
const SPRING_RULES = path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml');
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

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-'));
  roots.push(root);
  const java = path.join(root, 'jdk/bin/java');
  mkdirSync(path.dirname(java), { recursive: true });
  writeFileSync(
    java,
    ['#!/bin/sh', `cat "\${1#@}" > '${path.join(root, 'java-arguments')}'`].join('\n'),
  );
  chmodSync(java, 0o755);
  vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
  return root;
}

function pmd(root, { release = '17', tests: testDirectories, pmdConfig, spring = false }) {
  const basedir = path.join(root, 'app');
  const main = path.join(basedir, 'src/main/java');
  mkdirSync(main, { recursive: true });
  for (const [directory, created] of testDirectories) {
    if (created) {
      mkdirSync(path.join(basedir, directory), { recursive: true });
    }
  }
  const reportDir = path.join(basedir, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(path.join(reportDir, 'pmd.sarif'), '');
  const testSourceRoots = testDirectories.map(([directory]) => path.join(basedir, directory));
  runPmd({
    module: {
      basedir,
      sourceRoots: [main],
      testSourceRoots,
      outputDirectory: path.join(basedir, 'target/classes'),
      testOutputDirectory: path.join(basedir, 'target/test-classes'),
      compiler: { release, args: [] },
    },
    reportDir,
    tools: { pmd: ['/tools/pmd.jar'] },
    classpaths: { mainCompile: [], testCompile: [] },
    configs: { pmd: pmdConfig },
    spring,
  });
  const tokens = readFileSync(path.join(root, 'java-arguments'), 'utf8')
    .split('\n')
    .map((line) => JSON.parse(line));
  return {
    basedir,
    reportDir,
    main,
    testSourceRoots,
    option: (name) => tokens[tokens.indexOf(name) + 1],
    text: (name) => readFileSync(path.join(reportDir, name), 'utf8'),
    exists: (name) => existsSync(path.join(reportDir, name)),
  };
}

const TEST_DIRECTORY = [['src/test/java', true]];

function ruleset({ name, patterns, ref, skipped = [] }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<ruleset name="${name}" xmlns="${RULESET}">`,
    `  <description>${name}</description>`,
    ...patterns,
    ...(skipped.length === 0
      ? [`  <rule ref="${ref}"/>`]
      : [
          `  <rule ref="${ref}">`,
          ...skipped.map((rule) => `    <exclude name="${rule}"/>`),
          '  </rule>',
        ]),
    '</ruleset>',
    '',
  ].join('\n');
}

beforeEach(() => {
  vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('runPmd rulesets', () => {
  it.each([
    ['8', ['InstanceofThenCast', 'CollectorsToList']],
    ['15', ['InstanceofThenCast', 'CollectorsToList']],
    ['16', []],
    ['17', []],
  ])('skips the pattern matching rules for release %s: %j', (release, skipped) => {
    const root = workspace();
    const run = pmd(root, { release, tests: TEST_DIRECTORY, pmdConfig: { nitpicker: true } });

    expect(run.text('pmd-guards-main.xml')).toBe(
      ruleset({
        name: 'nitpicker-guards-main',
        patterns: [`  <exclude-pattern>${run.testSourceRoots[0]}/.*</exclude-pattern>`],
        ref: GUARDS_RULES,
        skipped,
      }),
    );
  });

  it('passes the project ruleset, the guard wrappers and the spring ruleset in order', () => {
    const root = workspace();
    const run = pmd(root, {
      tests: TEST_DIRECTORY,
      pmdConfig: { nitpicker: true, project: '/custom/pmd.xml' },
      spring: true,
    });

    expect(run.option('--rulesets')).toBe(
      [
        PMD_RULESET,
        '/custom/pmd.xml',
        path.join(run.reportDir, 'pmd-guards-main.xml'),
        path.join(run.reportDir, 'pmd-test-honesty.xml'),
        path.join(run.reportDir, 'pmd-tests.xml'),
        path.join(run.reportDir, 'pmd-spring-main.xml'),
      ].join(','),
    );
    expect(run.text('pmd-test-honesty.xml')).toBe(
      ruleset({
        name: 'nitpicker-test-honesty',
        patterns: [
          '  <exclude-pattern>.*</exclude-pattern>',
          `  <include-pattern>${run.testSourceRoots[0]}/.*</include-pattern>`,
        ],
        ref: HONESTY_RULES,
      }),
    );
    expect(run.text('pmd-spring-main.xml')).toBe(
      ruleset({
        name: 'nitpicker-spring-main',
        patterns: [`  <exclude-pattern>${run.testSourceRoots[0]}/.*</exclude-pattern>`],
        ref: SPRING_RULES,
      }),
    );
  });

  it('leaves the spring ruleset out when the project is not a spring project', () => {
    const run = pmd(workspace(), { tests: TEST_DIRECTORY, pmdConfig: { nitpicker: true } });

    expect(run.option('--rulesets')).toBe(
      [
        PMD_RULESET,
        path.join(run.reportDir, 'pmd-guards-main.xml'),
        path.join(run.reportDir, 'pmd-test-honesty.xml'),
        path.join(run.reportDir, 'pmd-tests.xml'),
      ].join(','),
    );
  });

  it('runs the test-only rules from a ruleset that keeps them off the main sources', () => {
    const run = pmd(workspace(), { tests: TEST_DIRECTORY, pmdConfig: { nitpicker: true } });

    expect(run.text('pmd-tests.xml')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<ruleset name="nitpicker-tests" xmlns="${RULESET}">`,
        "  <description>Nitpicker's test-only rules on test sources only.</description>",
        `  <exclude-pattern>${run.main}/.*</exclude-pattern>`,
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

  it.each([
    ['a project ruleset', { nitpicker: false, project: '/custom/pmd.xml' }, '/custom/pmd.xml'],
    ['no project ruleset', { nitpicker: false }, ''],
  ])(
    'adds no nitpicker rulesets or guard wrappers with %s when nitpicker is off',
    (_, config, expected) => {
      const run = pmd(workspace(), { tests: TEST_DIRECTORY, pmdConfig: config, spring: true });

      expect(run.option('--rulesets')).toBe(expected);
      expect(run.exists('pmd-guards-main.xml')).toBe(false);
      expect(run.exists('pmd-test-honesty.xml')).toBe(false);
    },
  );

  it('writes no test honesty wrapper when no test directory exists', () => {
    const run = pmd(workspace(), {
      tests: [['src/test/java', false]],
      pmdConfig: { nitpicker: true },
    });

    expect(run.option('--rulesets')).toBe(
      [
        PMD_RULESET,
        path.join(run.reportDir, 'pmd-guards-main.xml'),
        path.join(run.reportDir, 'pmd-tests.xml'),
      ].join(','),
    );
    expect(run.exists('pmd-test-honesty.xml')).toBe(false);
    expect(run.option('--dir')).toBe(run.main);
  });

  it('applies the test honesty wrapper only to the test directories that exist', () => {
    const run = pmd(workspace(), {
      tests: [
        ['src/test/java', true],
        ['src/it/java', false],
      ],
      pmdConfig: { nitpicker: true },
    });

    expect(run.text('pmd-test-honesty.xml')).toBe(
      ruleset({
        name: 'nitpicker-test-honesty',
        patterns: [
          '  <exclude-pattern>.*</exclude-pattern>',
          `  <include-pattern>${run.testSourceRoots[0]}/.*</include-pattern>`,
        ],
        ref: HONESTY_RULES,
      }),
    );
    expect(run.option('--dir')).toBe([run.main, run.testSourceRoots[0]].join(','));
  });

  it('escapes XML characters in the directory patterns', () => {
    const odd = 'src/te&st<a>"b"/java';
    const run = pmd(workspace(), { tests: [[odd, true]], pmdConfig: { nitpicker: true } });
    const escaped = `${run.basedir}/src/te&amp;st&lt;a&gt;&quot;b&quot;/java/.*`;

    expect(run.text('pmd-guards-main.xml')).toBe(
      ruleset({
        name: 'nitpicker-guards-main',
        patterns: [`  <exclude-pattern>${escaped}</exclude-pattern>`],
        ref: GUARDS_RULES,
        skipped: [],
      }),
    );
    expect(run.text('pmd-test-honesty.xml')).toBe(
      ruleset({
        name: 'nitpicker-test-honesty',
        patterns: [
          '  <exclude-pattern>.*</exclude-pattern>',
          `  <include-pattern>${escaped}</include-pattern>`,
        ],
        ref: HONESTY_RULES,
      }),
    );
  });
});
