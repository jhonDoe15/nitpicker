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
import { parseJson, textOf } from '../../../../shared/values/readers.mts';
import { runCpd, runPmd } from './maven-pmd.mts';

type PmdConfig = { nitpicker?: boolean; project?: string; projectWins?: boolean };

const roots: string[] = [];
const RULESET = 'http://pmd.sourceforge.net/ruleset/2.0.0';
const PMD_RULESET = path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml');
const GUARDS_RULES = path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml');
const HONESTY_RULES = path.join(GRADLE_DIRECTORY, 'rules/test-honesty-ruleset.xml');
const SPRING_RULES = path.join(GRADLE_DIRECTORY, 'spring-ruleset.xml');

function installFakeJdk(root: string, java: string): void {
  const bin = path.join(root, 'jdk/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'java'), java);
  writeFileSync(path.join(bin, 'javac'), '#!/bin/sh\nexit 0\n');
  for (const name of ['java', 'javac']) {
    chmodSync(path.join(bin, name), 0o755);
  }
  vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
  vi.stubEnv('XDG_CACHE_HOME', path.join(root, 'cache'));
}

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-'));
  roots.push(root);
  installFakeJdk(
    root,
    ['#!/bin/sh', `cat "\${1#@}" > '${path.join(root, 'java-arguments')}'`].join('\n'),
  );
  return root;
}

function pmd(
  root: string,
  {
    release = '17',
    tests: testDirectories,
    pmdConfig,
    spring = false,
  }: {
    release?: string;
    tests: readonly (readonly [string, boolean])[];
    pmdConfig: PmdConfig;
    spring?: boolean;
  },
) {
  const basedir = path.join(root, 'app');
  const main = path.join(basedir, 'src/main/java');
  mkdirSync(main, { recursive: true });
  writeFileSync(path.join(main, 'A.java'), 'class A {}\n');
  for (const [directory, created] of testDirectories) {
    if (created) {
      mkdirSync(path.join(basedir, directory), { recursive: true });
    }
  }
  const reportDir = path.join(basedir, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(path.join(reportDir, 'pmd.sarif'), '');
  if (pmdConfig.project !== undefined) {
    pmdConfig = { ...pmdConfig, project: path.join(root, 'project-pmd.xml') };
    writeFileSync(
      textOf(pmdConfig.project),
      '<ruleset xmlns="http://pmd.sourceforge.net/ruleset/2.0.0" name="project"/>',
    );
  }
  const testSourceRoots = testDirectories.map(([directory]) => path.join(basedir, directory));
  runPmd({
    module: {
      basedir,
      sourceRoots: [main],
      testSourceRoots,
      outputDirectory: path.join(basedir, 'target/classes'),
      testOutputDirectory: path.join(basedir, 'target/test-classes'),
      compiler: { release, compilerArgs: [] },
    },
    reportDir,
    tools: { pmd: ['/tools/pmd.jar'] },
    classpaths: { mainCompile: [], testCompile: [] },
    configs: { pmd: pmdConfig },
    spring,
  });
  const tokens = readFileSync(path.join(root, 'java-arguments'), 'utf8')
    .split('\n')
    .map((line) => parseJson(line));
  return {
    basedir,
    reportDir,
    main,
    testSourceRoots,
    option: (name: string) => tokens[tokens.indexOf(name) + 1],
    text: (name: string) => readFileSync(path.join(reportDir, name), 'utf8'),
    exists: (name: string) => existsSync(path.join(reportDir, name)),
  };
}

const TEST_DIRECTORY: [string, boolean][] = [['src/test/java', true]];

function ruleset({
  name,
  patterns,
  ref,
  skipped = [],
  after = [],
}: {
  name: string;
  patterns: readonly string[];
  ref: string;
  skipped?: readonly string[];
  after?: readonly string[];
}): string {
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
    ...after,
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
  ])(
    'skips the pattern matching rules for release %s: %j',
    (release: string, pattern: string[]) => {
      const beforeTen = Number(release) < 10;
      const skipped = beforeTen ? [...pattern, 'OptionalGet'] : pattern;
      const after = beforeTen
        ? [
            `  <rule ref="${GUARDS_RULES}/OptionalGet" message="Use orElse(...), orElseThrow(Supplier), map or ifPresent instead of Optional.get()."/>`,
          ]
        : [];
      const root = workspace();
      const run = pmd(root, { release, tests: TEST_DIRECTORY, pmdConfig: { nitpicker: true } });

      expect(run.text('pmd-guards-main.xml')).toBe(
        ruleset({
          name: 'nitpicker-guards-main',
          patterns: [`  <exclude-pattern>${textOf(run.testSourceRoots[0])}/.*</exclude-pattern>`],
          ref: GUARDS_RULES,
          skipped,
          after,
        }),
      );
    },
  );

  it('passes the project ruleset, the guard wrappers, the test-class rule and the spring ruleset in order', () => {
    const root = workspace();
    const run = pmd(root, {
      tests: TEST_DIRECTORY,
      pmdConfig: { nitpicker: true, project: '/custom/pmd.xml' },
      spring: true,
    });

    expect(run.option('--rulesets')).toBe(
      [
        path.join(run.reportDir, 'pmd-nitpicker.xml'),
        path.join(run.reportDir, 'pmd-project.xml'),
        path.join(run.reportDir, 'pmd-tests.xml'),
        path.join(run.reportDir, 'pmd-main.xml'),
        path.join(run.reportDir, 'pmd-guards-main.xml'),
        path.join(run.reportDir, 'pmd-test-honesty.xml'),
      ].join(','),
    );
    expect(run.text('pmd-test-honesty.xml')).toBe(
      ruleset({
        name: 'nitpicker-test-honesty',
        patterns: [
          '  <exclude-pattern>.*</exclude-pattern>',
          `  <include-pattern>${textOf(run.testSourceRoots[0])}/.*</include-pattern>`,
        ],
        ref: HONESTY_RULES,
      }),
    );
    expect(run.text('pmd-main.xml')).toContain(SPRING_RULES);
  });

  it('leaves the spring ruleset out when the project is not a spring project', () => {
    const run = pmd(workspace(), { tests: TEST_DIRECTORY, pmdConfig: { nitpicker: true } });

    expect(run.option('--rulesets')).toBe(
      [
        PMD_RULESET,
        path.join(run.reportDir, 'pmd-tests.xml'),
        path.join(run.reportDir, 'pmd-main.xml'),
        path.join(run.reportDir, 'pmd-guards-main.xml'),
        path.join(run.reportDir, 'pmd-test-honesty.xml'),
      ].join(','),
    );
  });

  it('keeps guard rules with the project layer first', () => {
    const run = pmd(workspace(), {
      tests: TEST_DIRECTORY,
      pmdConfig: { project: '/custom/pmd.xml', projectWins: true },
      spring: true,
    });
    expect(run.option('--rulesets')).toContain(path.join(run.reportDir, 'pmd-project.xml'));
    expect(run.exists('pmd-guards-main.xml')).toBe(true);
    expect(run.exists('pmd-test-honesty.xml')).toBe(true);
    expect(run.text('pmd-main.xml')).toContain(SPRING_RULES);
  });

  it('writes no test honesty wrapper when no test directory exists', () => {
    const run = pmd(workspace(), {
      tests: [['src/test/java', false]],
      pmdConfig: { nitpicker: true },
    });

    expect(run.option('--rulesets')).toBe(
      [
        PMD_RULESET,
        path.join(run.reportDir, 'pmd-tests.xml'),
        path.join(run.reportDir, 'pmd-main.xml'),
        path.join(run.reportDir, 'pmd-guards-main.xml'),
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
          `  <include-pattern>${textOf(run.testSourceRoots[0])}/.*</include-pattern>`,
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

function fakeCpdJava({
  report,
  stderr,
  ending,
}: {
  report: string;
  stderr: string;
  ending: string;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cpd-'));
  roots.push(root);
  writeFileSync(path.join(root, 'report'), report);
  writeFileSync(path.join(root, 'stderr'), stderr);
  const script = [
    `if [ "$1" = -XshowSettings:properties ]; then`,
    `  printf '    java.vendor = Fake\\n    java.version = 21.0.1\\n' >&2; exit 0`,
    'fi',
    `cat "\${1#@}" > '${root}/arguments'`,
    `cat '${root}/report' > '${root}/app/target/nitpicker/cpd.xml'`,
    `cat '${root}/stderr' >&2`,
  ];
  installFakeJdk(root, ['#!/bin/sh', ...script, ending].join('\n'));
  return root;
}

function reportFiles(reportDir: string): (string | undefined)[] {
  return ['cpd.xml', 'cpd-failed.txt', 'cpd-skipped.txt'].map((name) =>
    existsSync(path.join(reportDir, name))
      ? readFileSync(path.join(reportDir, name), 'utf8')
      : undefined,
  );
}

function cpd(run: { report: string; stderr: string; ending: string; configs?: unknown }) {
  const root = fakeCpdJava(run);
  const basedir = path.join(root, 'app');
  const reportDir = path.join(basedir, 'target/nitpicker');
  const generatedRoot = path.join(basedir, 'target/generated-sources/proto');
  mkdirSync(path.join(basedir, 'src/main/java'), { recursive: true });
  mkdirSync(generatedRoot, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  for (const stale of ['cpd.xml', 'cpd-failed.txt', 'cpd-skipped.txt']) {
    writeFileSync(path.join(reportDir, stale), 'stale');
  }
  runCpd({
    module: {
      basedir,
      sourceRoots: [path.join(basedir, 'src/main/java'), generatedRoot],
      testSourceRoots: [],
    },
    reportDir,
    tools: { pmd: ['/tools/pmd.jar'] },
    configs: run.configs,
  });
  const tokens = readFileSync(path.join(root, 'arguments'), 'utf8').split('\n');
  return {
    outputs: reportFiles(reportDir),
    arguments: tokens.map((line) => parseJson(line)),
    basedir,
  };
}

describe.skipIf(process.platform === 'win32')('runCpd', () => {
  it('keeps the XML report the CPD launcher writes when it exits 0', () => {
    const run = cpd({ report: CPD_XML, stderr: '', ending: 'exit 0' });

    expect(run.outputs).toEqual([CPD_XML, undefined, undefined]);
    expect(run.arguments).toEqual([
      '-cp',
      expect.stringMatching(/cpd-report\/[0-9a-f]{64}:\/tools\/pmd\.jar$/u),
      'CpdReport',
      path.join(run.basedir, 'target/nitpicker/cpd.xml'),
      path.join(run.basedir, 'src/main/java'),
    ]);
  });

  it('reads generated source roots only when the project opts in', () => {
    const opted = cpd({
      report: CPD_XML,
      stderr: '',
      ending: 'exit 0',
      configs: { generated: { analyze: true } },
    });

    expect(opted.arguments.slice(-2)).toEqual([
      path.join(opted.basedir, 'src/main/java'),
      path.join(opted.basedir, 'target/generated-sources/proto'),
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
    vi.stubEnv('XDG_CACHE_HOME', path.join(basedir, 'cache'));
    mkdirSync(path.join(basedir, 'src/main/java'), { recursive: true });

    runCpd({
      module: { basedir, sourceRoots: [path.join(basedir, 'src/main/java')], testSourceRoots: [] },
      reportDir: basedir,
      tools: { pmd: ['/tools/pmd.jar'] },
    });

    expect(reportFiles(basedir)).toEqual([
      undefined,
      `Error\nPMD CPD need the JDK identity, but java -version failed: spawnSync ${java} EACCES`,
      undefined,
    ]);
  });
});
