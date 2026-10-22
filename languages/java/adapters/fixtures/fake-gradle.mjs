#!/usr/bin/env node
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

if (existsSync('GRADLE_STDOUT')) {
  process.stdout.write(readFileSync('GRADLE_STDOUT', 'utf8'));
}

if (existsSync('GRADLE_FAIL')) {
  process.stderr.write(`${readFileSync('GRADLE_FAIL', 'utf8')}\n`);
  process.exit(1);
}
const reportBase = process.argv
  .find((argument) => argument.startsWith('-Pnitpicker.reportDir='))
  ?.split('=')[1];
const lines = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
const sarif = (name, results) =>
  JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
const kotlin = process.argv.includes('-Pnitpicker.kotlin=true');
const formatterArgument = process.argv.find((argument) =>
  argument.startsWith('-Pnitpicker.kotlin.formatter='),
);

function resultAt(uri, index, fields) {
  return {
    ...fields,
    locations: [
      { physicalLocation: { artifactLocation: { uri }, region: { startLine: index + 3 } } },
    ],
  };
}

function writeKotlinReports(report, { kotlinFile, inside }) {
  writeFileSync(
    report('detekt.sarif'),
    sarif(
      'detekt',
      lines('detekt.txt').map((line, index) =>
        resultAt(kotlinFile, index, {
          ruleId: line.includes(' :: ') ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
          level: 'warning',
          message: { text: line.includes(' :: ') ? line.split(' :: ')[1] : line },
        }),
      ),
    ),
  );
  writeFileSync(
    report('ktlint.sarif'),
    sarif(
      'ktlint',
      lines('ktlint.txt').map((line, index) =>
        resultAt(kotlinFile, index, {
          ruleId: line.split('|')[0],
          level: 'error',
          message: { text: line.split('|')[1] },
        }),
      ),
    ),
  );
  writeFileSync(report('ktfmt.txt'), lines('kotlin-format.txt').join('\n'));
  const metrics = [inside('kotlin-metrics.json'), 'kotlin-metrics.json'].find((file) =>
    existsSync(file),
  );
  if (metrics !== undefined) {
    writeFileSync(report('kotlin-metrics.json'), readFileSync(metrics));
  }
}

function writeModule({ key, dir }) {
  const report = (name) => {
    const file = path.join(reportBase, key, name);
    mkdirSync(path.dirname(file), { recursive: true });
    return file;
  };
  const inside = (file) => (dir === '' ? file : `${dir}/${file}`);
  writeFileSync(
    report('manifest.json'),
    JSON.stringify({
      versions: {},
      sourceRoots: [inside('src/main/java')],
      testsFailed: testsFailedModules.includes(dir === '' ? '.' : dir),
      ...(kotlin && {
        kotlin: true,
        kotlinSourceRoots: [inside('src/main/kotlin')],
        kotlinFormatter: formatterArgument?.split('=')[1] ?? 'none',
      }),
    }),
  );
  if (lines('EMPTY_MODULES').includes(dir)) {
    return;
  }
  if (kotlin) {
    writeKotlinReports(report, { kotlinFile: inside('src/main/kotlin/demo/K.kt'), inside });
  }
  writeFileSync(
    report('pmd.sarif'),
    sarif(
      'PMD',
      lines('violations.txt').map((text, index) =>
        resultAt(inside('src/main/java/demo/A.java'), index, {
          ruleId: 'UnusedPrivateField',
          message: { text },
        }),
      ),
    ),
  );
  writeFileSync(report('spotbugs.sarif'), sarif('SpotBugs', []));
  writeFileSync(report('format.txt'), '');
  writeFileSync(
    report('checkstyle.xml'),
    existsSync('checkstyle-report.xml')
      ? readFileSync('checkstyle-report.xml')
      : '<checkstyle version="10.21.1"></checkstyle>',
  );
  const moduleName = dir === '' ? '.' : dir;
  if (!lines('NO_JACOCO_IN').includes(moduleName) && !testsFailedModules.includes(moduleName)) {
    writeFileSync(
      report('jacoco.xml'),
      existsSync('jacoco.xml') ? readFileSync('jacoco.xml') : '<report name="demo"></report>',
    );
  }
  if (existsSync('MAIN_CLASSES')) {
    writeFileSync(report('jdeps-classes.txt'), 'demo.A\n');
  }
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'jdeps-test.txt']) {
    const source = [inside(name), inside(`jdeps/${name}`)].find((file) => existsSync(file));
    if (source !== undefined) {
      writeFileSync(report(name), readFileSync(source));
    }
  }
  if (existsSync(inside('test-results'))) {
    cpSync(inside('test-results'), path.join(reportBase, key, 'test-results'), { recursive: true });
  }
  if (existsSync('mutations.xml')) {
    writeFileSync(report('pit/mutations.xml'), readFileSync('mutations.xml'));
  }
  writeFileSync(report('structure.json'), '[]');
  writeFileSync(report('classes.json'), '{"files":{},"classes":[]}');
}

const testsFailedModules =
  process.argv
    .find((argument) => argument.startsWith('-Pnitpicker.testsFailed='))
    ?.split('=')[1]
    .split(',') ?? [];
function failTests() {
  if (!existsSync('TESTS_FAIL') || testsFailedModules.length > 0) {
    return;
  }
  const failing = Object.entries(JSON.parse(readFileSync('TESTS_FAIL', 'utf8')));
  const listed = failing.map(([dir, suite]) => {
    const results = path.resolve('build/test-results', dir || 'root');
    mkdirSync(results, { recursive: true });
    writeFileSync(path.join(results, 'TEST-demo.ATest.xml'), suite);
    return { dir, results: [results] };
  });
  writeFileSync(path.join(reportBase, 'test-results.json'), JSON.stringify(listed));
  process.stderr.write('FAILURE: Build failed with an exception.\n');
  process.exit(1);
}

const modules = existsSync('NO_REPORTS')
  ? []
  : [
      { key: 'root', path: ':', dir: '' },
      ...lines('modules.txt').map((dir) => ({ key: `module-${dir}`, path: `:${dir}`, dir })),
    ];
mkdirSync(reportBase, { recursive: true });
mkdirSync('build', { recursive: true });
failTests();
writeFileSync('build/gradle-args.json', JSON.stringify(process.argv.slice(2)));
appendFileSync('build/gradle-calls.jsonl', `${JSON.stringify(process.argv.slice(2))}\n`);
const exportArgument = process.argv.find((argument) =>
  argument.startsWith('-Pnitpicker.checkstyle.exportConfig='),
);
if (exportArgument !== undefined) {
  writeFileSync(exportArgument.slice(exportArgument.indexOf('=') + 1), '<module name="Checker"/>');
}
const styleFileArgument = process.argv.find((argument) =>
  argument.startsWith('-Pnitpicker.kotlin.styleFile='),
);
if (styleFileArgument !== undefined) {
  writeFileSync(
    'build/style-file.json',
    readFileSync(styleFileArgument.slice(styleFileArgument.indexOf('=') + 1)),
  );
}
writeFileSync(path.join(reportBase, 'modules.json'), JSON.stringify(modules));
for (const module of modules) {
  writeModule(module);
}
