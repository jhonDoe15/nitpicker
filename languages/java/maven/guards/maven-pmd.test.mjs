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
import { runCpd, runPmd } from './maven-pmd.mjs';

const roots = [];
const RULESET = 'http://pmd.sourceforge.net/ruleset/2.0.0';
const PMD_RULESET = path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml');
const GUARDS_RULES = path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml');
const HONESTY_RULES = path.join(GRADLE_DIRECTORY, 'rules/test-honesty-ruleset.xml');
const SPRING_RULES = path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml');

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

  it('passes the project ruleset, the guard wrappers, the test-class rule and the spring ruleset in order', () => {
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

const CPD_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<pmd-cpd pmdVersion="7.7.0">\n</pmd-cpd>\n';
const CPD_CRASH =
  '[main] ERROR net.sourceforge.pmd.cli - Exception while running CPD: NullPointerException';

function fakeCpdJava({ report, stderr, ending }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-'));
  roots.push(root);
  const java = path.join(root, 'jdk/bin/java');
  mkdirSync(path.dirname(java), { recursive: true });
  writeFileSync(path.join(root, 'report'), report);
  writeFileSync(path.join(root, 'stderr'), stderr);
  const script = [
    `cat "\${1#@}" > '${root}/arguments'`,
    `cat '${root}/report' > '${root}/app/target/nitpicker/cpd.xml'`,
    `cat '${root}/stderr' >&2`,
  ];
  writeFileSync(java, ['#!/bin/sh', ...script, ending].join('\n'));
  chmodSync(java, 0o755);
  vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
  return root;
}

function reportFiles(reportDir) {
  return ['cpd.xml', 'cpd-failed.txt', 'cpd-skipped.txt'].map((name) =>
    existsSync(path.join(reportDir, name))
      ? readFileSync(path.join(reportDir, name), 'utf8')
      : undefined,
  );
}

function cpd(run) {
  const root = fakeCpdJava(run);
  const basedir = path.join(root, 'app');
  const reportDir = path.join(basedir, 'target/nitpicker');
  mkdirSync(path.join(basedir, 'src/main/java'), { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  for (const stale of ['cpd.xml', 'cpd-failed.txt', 'cpd-skipped.txt']) {
    writeFileSync(path.join(reportDir, stale), 'stale');
  }
  runCpd({
    module: { basedir, sourceRoots: [path.join(basedir, 'src/main/java')], testSourceRoots: [] },
    reportDir,
    tools: { pmd: ['/tools/pmd.jar'] },
  });
  const tokens = readFileSync(path.join(root, 'arguments'), 'utf8').split('\n');
  return {
    outputs: reportFiles(reportDir),
    arguments: tokens.map((line) => JSON.parse(line)),
    basedir,
  };
}

describe.skipIf(process.platform === 'win32')('runCpd', () => {
  it('keeps the XML report the CPD launcher writes when it exits 0', () => {
    const run = cpd({ report: CPD_XML, stderr: '', ending: 'exit 0' });

    expect(run.outputs).toEqual([CPD_XML, undefined, undefined]);
    expect(run.arguments).toEqual([
      '-cp',
      '/tools/pmd.jar',
      path.join(GRADLE_DIRECTORY, 'CpdReport.java'),
      path.join(run.basedir, 'target/nitpicker/cpd.xml'),
      path.join(run.basedir, 'src/main/java'),
    ]);
  });

  it.each([
    ['a crash that exits 0 with no report', '', 'exit 0', '0'],
    ['an exit code other than 0', CPD_XML, 'exit 4', '4'],
    ['output that is not a CPD report', 'oops', 'exit 0', '0'],
    ['a launcher killed by a signal', CPD_XML, 'kill -9 $$', 'SIGKILL'],
  ])('records the exit and stderr instead of a report for %s', (_, report, ending, exit) => {
    const run = cpd({ report, stderr: `${CPD_CRASH}\n`, ending });

    expect(run.outputs).toEqual([undefined, `${exit}\n${CPD_CRASH}\n`, undefined]);
  });

  it('records a java that cannot start instead of failing the run', () => {
    const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-'));
    roots.push(basedir);
    const java = path.join(basedir, 'jdk/bin/java');
    mkdirSync(path.dirname(java), { recursive: true });
    writeFileSync(java, 'not executable');
    vi.stubEnv('JAVA_HOME', path.join(basedir, 'jdk'));
    mkdirSync(path.join(basedir, 'src/main/java'), { recursive: true });

    runCpd({
      module: { basedir, sourceRoots: [path.join(basedir, 'src/main/java')], testSourceRoots: [] },
      reportDir: basedir,
      tools: { pmd: ['/tools/pmd.jar'] },
    });

    expect(reportFiles(basedir)).toEqual([
      undefined,
      `EACCES\nspawnSync ${java} EACCES`,
      undefined,
    ]);
  });
});
