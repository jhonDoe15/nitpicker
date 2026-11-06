import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prefixedFinding, readModuleFindings } from './java-modules.mjs';

const ROUTE =
  'If this is intended, add {"rule":"function-lines-limit","paths":["src/main/java/demo/Big.java"],"function":"Big.big","reason":"..."} to "exceptions" in nitpicker.config.json.';
const MOVED_ROUTE =
  'If this is intended, add {"rule":"function-lines-limit","paths":["core/src/main/java/demo/Big.java"],"function":"Big.big","reason":"..."} to "exceptions" in nitpicker.config.json.';
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

function writeModule(moduleDir, { className, lines, methods = 0 }) {
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
  write(path.join(reports, 'errorprone.json'), '[]');
  write(path.join(reports, 'format.txt'), '');
  write(path.join(reports, 'jacoco.xml'), '<report name="demo"></report>');
  write(path.join(reports, 'checkstyle.xml'), '<checkstyle version="10.21.1"></checkstyle>');
  write(path.join(reports, 'structure.json'), '[]');
  const file = `src/main/java/demo/${className}.java`;
  write(
    path.join(reports, 'classes.json'),
    JSON.stringify({
      files: { [file]: { package: 'demo', imports: [] } },
      classes: [{ file, name: className, kind: 'class', start: 1, methods, fields: 0 }],
    }),
  );
  write(path.join(reports, 'jdeps.txt'), '');
  write(path.join(reports, 'jdeps-classes.txt'), `demo.${className}\n`);
  write(path.join(reports, 'duplicates.json'), JSON.stringify({ runs: [] }));
}

function mavenProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-modules-')));
  temporaryRoots.push(root);
  writeModule(path.join(root, 'core'), { className: 'Adder', lines: 320 });
  writeModule(path.join(root, 'app'), { className: 'Main', lines: 10, methods: 21 });
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
      ['structure', 'class-methods-limit', 'app/src/main/java/demo/Main.java'],
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
      ['structure', 'class-methods-limit', 'app/src/main/java/demo/Main.java'],
    ]);
    const single = path.join(root, 'app');
    expect(
      summary(readModuleFindings(single, [single], { reportDirectory: REPORT_DIRECTORY })),
    ).toEqual([
      ['pmd', 'EmptyCatchBlock', 'src/main/java/demo/Main.java'],
      ['structure', 'class-methods-limit', 'src/main/java/demo/Main.java'],
    ]);
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

  it('names the module folder in the exception a module class limit offers and honours', () => {
    const root = mavenProject();
    const modules = [path.join(root, 'app'), path.join(root, 'core')];
    const classLimits = (exceptions) =>
      readModuleFindings(root, modules, { reportDirectory: REPORT_DIRECTORY, exceptions }).filter(
        ({ rule }) => rule === 'class-methods-limit',
      );
    const main = 'app/src/main/java/demo/Main.java';

    const offered = classLimits([]).map(({ message }) =>
      JSON.parse(/\{"rule".*?\}/u.exec(message)?.[0] ?? '{}'),
    );

    expect(offered).toEqual([{ rule: 'class-methods-limit', paths: [main], reason: '...' }]);
    expect(classLimits([{ rule: 'class-methods-limit', paths: ['app/src/**'] }])).toEqual([]);
    expect(classLimits([{ rule: 'class-methods-limit', paths: ['src/**'] }])).toHaveLength(1);
  });
});

describe('prefixedFinding', () => {
  it('moves the path of a module finding and the file its exception sentence names', () => {
    const finding = {
      tool: 'structure',
      rule: 'function-lines-limit',
      path: 'src/main/java/demo/Big.java',
      identity: 'function:Big.big:occurrence:1:source:abc',
      message: `Big.big has 51 lines; limit is 50. ${ROUTE}`,
      classification: 'enforceable',
      ratchet: {
        key: 'function:Big.big:occurrence:1:lines',
        value: 51,
        heldMessage: 'Big.big: 51 lines (limit 50), allowed because base was {base}.',
        worseMessage: `Big.big grew from {base} to 51 lines (limit 50). ${ROUTE}`,
      },
    };

    expect(prefixedFinding(finding, 'core')).toEqual({
      ...finding,
      path: 'core/src/main/java/demo/Big.java',
      message: `Big.big has 51 lines; limit is 50. ${MOVED_ROUTE}`,
      ratchet: {
        ...finding.ratchet,
        worseMessage: `Big.big grew from {base} to 51 lines (limit 50). ${MOVED_ROUTE}`,
      },
    });
  });

  it('leaves a root module finding as it is', () => {
    const finding = {
      tool: 'pmd',
      rule: 'UnusedPrivateField',
      path: 'src/main/java/demo/A.java',
      identity: 'fp:nitpicker/subject=Avoid unused field: added',
      message: 'Avoid unused field: added',
      classification: 'enforceable',
    };

    expect(prefixedFinding(finding, '')).toEqual(finding);
  });
});
