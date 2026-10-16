import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readModuleFindings } from './java-modules.mjs';

const REPORT_DIRECTORY = 'target/nitpicker';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function sarif(results = []) {
  return JSON.stringify({ runs: [{ tool: { driver: { name: 'PMD', rules: [] } }, results }] });
}

function writeModule(moduleDir, { className, lines }) {
  const source = path.join(moduleDir, `src/main/java/demo/${className}.java`);
  write(source, `${Array.from({ length: lines }, () => '').join('\n')}\n`);
  const reports = path.join(moduleDir, REPORT_DIRECTORY);
  write(
    path.join(reports, 'manifest.json'),
    JSON.stringify({ build: 'maven', sourceRoots: ['src/main/java'], testSourceRoots: [] }),
  );
  write(
    path.join(reports, 'pmd.sarif'),
    sarif([
      {
        ruleId: 'EmptyCatchBlock',
        message: { text: 'Avoid empty catch blocks' },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: `file://${source}` },
              region: { startLine: 2 },
            },
          },
        ],
      },
    ]),
  );
  write(path.join(reports, 'spotbugs.sarif'), sarif());
  write(path.join(reports, 'format.txt'), '');
  write(path.join(reports, 'jacoco.xml'), '<report name="demo"></report>');
  write(path.join(reports, 'checkstyle.xml'), '<checkstyle version="10.21.1"></checkstyle>');
  write(path.join(reports, 'structure.json'), '[]');
  write(path.join(reports, 'jdeps.txt'), '');
  write(path.join(reports, 'jdeps-classes.txt'), `demo.${className}\n`);
  write(path.join(reports, 'duplicates.json'), JSON.stringify({ runs: [] }));
}

function mavenProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-modules-')));
  temporaryRoots.push(root);
  writeModule(path.join(root, 'core'), { className: 'Adder', lines: 320 });
  writeModule(path.join(root, 'app'), { className: 'Main', lines: 10 });
  return root;
}

const summary = (findings) =>
  findings
    .filter(({ tool }) => tool !== 'coupling')
    .map(({ tool, rule, path: file }) => [tool, rule, file])
    .sort();

describe('readModuleFindings', () => {
  it('reads each Maven module report and prefixes its paths with the module folder', () => {
    const root = mavenProject();
    const findings = readModuleFindings(root, [path.join(root, 'app'), path.join(root, 'core')], {
      reportDirectory: REPORT_DIRECTORY,
    });
    expect(summary(findings)).toEqual([
      ['pmd', 'EmptyCatchBlock', 'app/src/main/java/demo/Main.java'],
      ['pmd', 'EmptyCatchBlock', 'core/src/main/java/demo/Adder.java'],
      ['structure', 'file-lines-limit', 'core/src/main/java/demo/Adder.java'],
    ]);
    const coupling = findings
      .filter(({ tool }) => tool === 'coupling')
      .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`);
    expect(coupling.length).toBeGreaterThan(0);
    expect(new Set(coupling).size).toBe(coupling.length);
  });

  it('reads a single module at the project root without a prefix', () => {
    const root = mavenProject();
    const findings = readModuleFindings(root, [path.join(root, 'app')], {
      reportDirectory: REPORT_DIRECTORY,
    });
    expect(summary(findings)).toEqual([
      ['pmd', 'EmptyCatchBlock', 'app/src/main/java/demo/Main.java'],
    ]);
    const single = path.join(root, 'app');
    expect(
      summary(readModuleFindings(single, [single], { reportDirectory: REPORT_DIRECTORY })),
    ).toEqual([['pmd', 'EmptyCatchBlock', 'src/main/java/demo/Main.java']]);
  });

  it('gives each module its path so a slow test is compared with the base file of that module', () => {
    const root = mavenProject();
    const base = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-modules-base-'));
    temporaryRoots.push(base);
    const testSource =
      'package demo;\nclass AdderTest {\n  @Test\n  void adds() {\n    check();\n  }\n}\n';
    const testFile = 'src/test/java/demo/AdderTest.java';
    write(path.join(root, 'core', testFile), testSource);
    write(path.join(base, 'core', testFile), testSource);
    const results = path.join(root, 'core', REPORT_DIRECTORY, 'test-results/surefire');
    write(
      path.join(results, 'TEST-demo.AdderTest.xml'),
      '<testsuite name="demo.AdderTest"><testcase classname="demo.AdderTest" name="adds()" time="9"/></testsuite>',
    );
    const manifestFile = path.join(root, 'core', REPORT_DIRECTORY, 'manifest.json');
    write(
      manifestFile,
      JSON.stringify({
        build: 'maven',
        sourceRoots: ['src/main/java'],
        testSourceRoots: ['src/test/java'],
      }),
    );
    const slow = (baselineRoot) =>
      readModuleFindings(root, [path.join(root, 'app'), path.join(root, 'core')], {
        reportDirectory: REPORT_DIRECTORY,
        baseline: { snapshot: 'head', baselineRoot },
      })
        .filter(({ tool }) => tool === 'test-runtime')
        .map(({ path: file }) => file);

    expect(slow(base)).toEqual([]);
    expect(slow(undefined)).toEqual([`core/${testFile}`]);
    write(path.join(base, 'core', testFile), testSource.replace('check()', 'other()'));
    expect(slow(base)).toEqual([`core/${testFile}`]);
  });

  it('keeps a class of the same name in two modules apart, each on its own file', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-modules-')));
    temporaryRoots.push(root);
    writeModule(path.join(root, 'core'), { className: 'Same', lines: 5 });
    writeModule(path.join(root, 'app'), { className: 'Same', lines: 5 });
    write(path.join(root, 'app', REPORT_DIRECTORY, 'jdeps-classes.txt'), 'demo.Same\ndemo.Main\n');
    write(path.join(root, 'app', REPORT_DIRECTORY, 'jdeps.txt'), '   demo.Main -> demo.Same app\n');

    const coupling = readModuleFindings(root, [path.join(root, 'app'), path.join(root, 'core')], {
      reportDirectory: REPORT_DIRECTORY,
    })
      .filter(
        ({ identity, path: file }) => identity === 'module:fanIn' && file.endsWith('Same.java'),
      )
      .map((finding) => `${finding.path} ${String(finding.metric.value)}`);

    expect(coupling.toSorted()).toEqual([
      'app/src/main/java/demo/Same.java 1',
      'core/src/main/java/demo/Same.java 0',
    ]);
  });

  it('gives a module the same coupling identities whether it is the only one or not', () => {
    const root = mavenProject();
    const coupling = (modules) =>
      readModuleFindings(
        root,
        modules.map((name) => path.join(root, name)),
        { reportDirectory: REPORT_DIRECTORY },
      )
        .filter(
          ({ tool, path: file, identity }) =>
            tool === 'coupling' && !file.startsWith('app/') && !identity.includes('app/'),
        )
        .map(({ path: file, identity }) => `${file} ${identity}`)
        .toSorted();

    const alone = coupling(['core']);
    expect(alone.filter((identity) => identity.endsWith('demo:modules'))).toEqual([
      '. package:core/demo:modules',
    ]);
    expect(coupling(['app', 'core'])).toEqual(alone);
  });
});
