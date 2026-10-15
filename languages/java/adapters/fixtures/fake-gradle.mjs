#!/usr/bin/env node
// Stand-in for `gradle -I nitpicker.init.gradle nitpickerJava` in tests that run without Java.
// In the project directory (cwd): a file `GRADLE_FAIL` makes the run fail with its text, a file
// `NO_REPORTS` makes it succeed without a project that applies the java plugin, and each
// line of `violations.txt` becomes one PMD violation in src/main/java/demo/A.java. With
// `-Pnitpicker.kotlin=true` each line of `detekt.txt` becomes one detekt result in
// src/main/kotlin/demo/K.kt (rule `detekt.style.MagicNumber`, or the part before ` :: ` in the line),
// each line of `ktlint.txt` (`rule|message`) one ktlint result there and each line of
// `kotlin-format.txt` a file ktfmt would change, a file `kotlin-metrics.json` is the Kotlin metrics
// report as it is, a file `jacoco.xml` becomes the JaCoCo report and a file `mutations.xml` the PIT
// report. A file `modules.txt` lists more projects, one directory per line: each gets the same reports,
// its sources under that directory, in the report directory module-<directory>. The reports go to the
// directory of -Pnitpicker.reportDir; the arguments are kept in build/gradle-args.json.
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

function writeKotlinReports(report, kotlinFile) {
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
  if (existsSync('kotlin-metrics.json')) {
    writeFileSync(report('kotlin-metrics.json'), readFileSync('kotlin-metrics.json'));
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
  if (kotlin) {
    writeKotlinReports(report, inside('src/main/kotlin/demo/K.kt'));
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
  writeFileSync(report('checkstyle.xml'), '<checkstyle version="10.21.1"></checkstyle>');
  writeFileSync(
    report('jacoco.xml'),
    existsSync('jacoco.xml') ? readFileSync('jacoco.xml') : '<report name="demo"></report>',
  );
  if (existsSync('mutations.xml')) {
    writeFileSync(report('pit/mutations.xml'), readFileSync('mutations.xml'));
  }
  writeFileSync(report('structure.json'), '[]');
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
