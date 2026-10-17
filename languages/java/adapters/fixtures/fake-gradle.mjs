#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
      ...(kotlin && {
        kotlin: true,
        kotlinSourceRoots: [inside('src/main/kotlin')],
        kotlinFormatter: formatterArgument?.split('=')[1] ?? 'none',
      }),
    }),
  );
  if (existsSync(inside('TEST_FAILURES'))) {
    writeFileSync(report('test-failures.json'), readFileSync(inside('TEST_FAILURES')));
  }
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
  writeFileSync(report('checkstyle.xml'), '<checkstyle version="13.5.0"></checkstyle>');
  if (!lines('NO_JACOCO_IN').includes(dir === '' ? '.' : dir)) {
    writeFileSync(
      report('jacoco.xml'),
      existsSync('jacoco.xml') ? readFileSync('jacoco.xml') : '<report name="demo"></report>',
    );
  }
  if (existsSync('MAIN_CLASSES')) {
    writeFileSync(report('jdeps-classes.txt'), 'demo.A\n');
  }
  for (const name of ['jdeps.txt', 'jdeps-classes.txt', 'permits.txt']) {
    if (existsSync(inside(name))) {
      writeFileSync(report(name), readFileSync(inside(name)));
    }
  }
  if (existsSync('mutations.xml')) {
    writeFileSync(report('pit/mutations.xml'), readFileSync('mutations.xml'));
  }
  writeFileSync(report('structure.json'), '[]');
  writeFileSync(report('classes.json'), '{"files":{},"classes":[]}');
}

const modules = existsSync('NO_REPORTS')
  ? []
  : [
      { key: 'root', path: ':', dir: '' },
      ...lines('modules.txt').map((dir) => ({ key: `module-${dir}`, path: `:${dir}`, dir })),
    ];
mkdirSync(reportBase, { recursive: true });
mkdirSync('build', { recursive: true });
writeFileSync('build/gradle-args.json', JSON.stringify(process.argv.slice(2)));
writeFileSync(path.join(reportBase, 'modules.json'), JSON.stringify(modules));
for (const module of modules) {
  writeModule(module);
}
