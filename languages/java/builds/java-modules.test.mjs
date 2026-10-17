import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../core/diff/comparison/compare.mjs';
import { parseAnalyzerReport } from '../../../core/diff/comparison/finding-schema.mjs';
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
  write(path.join(reports, 'checkstyle.xml'), '<checkstyle version="13.5.0"></checkstyle>');
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

  it('scopes a Maven module whose CPD run failed to that module across the reactor', () => {
    const base = reactor({ legacy: 'failed', modular: 'none' });
    const head = reactor({ legacy: 'clone', modular: 'clone', fresh: 'failed' });

    const result = compareFindings({ baseFindings: base, headFindings: head });

    expect(
      result.newFindings
        .filter(({ tool }) => tool === 'duplicates')
        .map(({ rule, path: file, classification }) => `${rule} ${file} ${classification}`),
    ).toEqual([
      'cpd-not-run fresh tool-error',
      'duplicate-clone legacy/src/main/java/demo/A.java descriptive',
      'duplicate-clone modular/src/main/java/demo/A.java enforceable',
    ]);
    expect(base.find(({ rule }) => rule === 'cpd-not-run').notRunScope).toEqual([
      'legacy/src/main/java',
    ]);
  });

  it('drops guard findings on files outside the project, so the report still parses', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reactor-')));
    const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-elsewhere-')));
    temporaryRoots.push(root, outside);
    const files = ['X', 'Y'].map((name) => path.join(outside, `src/p/${name}.java`));
    for (const file of files) {
      write(
        file,
        `class ${path.basename(file, '.java')} {\n  int run(int rate) {\n${LOGIC}\n  }\n}\n`,
      );
    }
    const platform = path.join(root, 'platform');
    cpdModule(platform, 'none');
    write(path.join(platform, REPORT_DIRECTORY, 'cpd.xml'), cpdReport(files));
    write(
      path.join(platform, REPORT_DIRECTORY, 'javac-lint.txt'),
      `${path.relative(platform, files[0])}:3: warning: [rawtypes] found raw type: List\n`,
    );

    const findings = readModuleFindings(root, [platform], { reportDirectory: REPORT_DIRECTORY });

    expect(findings.filter(({ tool }) => ['duplicates', 'javac'].includes(tool))).toEqual([]);
    expect(parseAnalyzerReport({ findings }, 'java').findings).toEqual(findings);
  });

  it('places the source roots of a failed Maven module under its folder before it scopes them', () => {
    const findings = reactor({ outside: 'failed', platform: 'failed' }, (module) =>
      module === 'outside' ? ['src/main/java', '../shared/src'] : ['../../elsewhere/src'],
    );

    expect(
      findings
        .filter(({ rule }) => rule === 'cpd-not-run')
        .map(({ path: file, toolNotRun, notRunScope }) => [file, toolNotRun, notRunScope]),
    ).toEqual([
      ['outside', true, ['outside/src/main/java', 'shared/src']],
      ['platform', undefined, undefined],
    ]);
  });
});

const LOGIC = Array.from(
  { length: 12 },
  (_, index) => `    total += compute(${String(index)}) * rate;`,
).join('\n');

function cpdReport(files) {
  const sides = files
    .map((file) => `<file path="${file}" line="2" endline="9" begintoken="0" endtoken="9"/>`)
    .join('');
  const duplication =
    files.length === 0 ? '' : `<duplication lines="8" tokens="120">${sides}</duplication>`;
  return `<?xml version="1.0"?>\n<pmd-cpd>${duplication}</pmd-cpd>\n`;
}

function cpdModule(moduleDir, outcome) {
  writeModule(moduleDir, { className: 'Main', lines: 5 });
  const reports = path.join(moduleDir, REPORT_DIRECTORY);
  if (outcome === 'failed') {
    write(path.join(reports, 'cpd-failed.txt'), '1\n');
    return;
  }
  const names = outcome === 'clone' ? ['A', 'B'] : [];
  const files = names.map((name) => path.join(moduleDir, `src/main/java/demo/${name}.java`));
  for (const name of names) {
    write(
      path.join(moduleDir, `src/main/java/demo/${name}.java`),
      `class ${name} {\n  int run(int rate) {\n    int total = 0;\n${LOGIC}\n    return total;\n  }\n}\n`,
    );
  }
  write(path.join(reports, 'cpd.xml'), cpdReport(files));
}

function reactor(modules, sourceRootsOf) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reactor-')));
  temporaryRoots.push(root);
  for (const [module, outcome] of Object.entries(modules)) {
    cpdModule(path.join(root, module), outcome);
    if (sourceRootsOf !== undefined) {
      write(
        path.join(root, module, REPORT_DIRECTORY, 'manifest.json'),
        JSON.stringify({ build: 'maven', sourceRoots: sourceRootsOf(module), testSourceRoots: [] }),
      );
    }
  }
  const moduleDirs = Object.keys(modules).map((module) => path.join(root, module));
  return readModuleFindings(root, moduleDirs, { reportDirectory: REPORT_DIRECTORY });
}
