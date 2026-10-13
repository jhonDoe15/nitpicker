#!/usr/bin/env node
// Stand-in for `gradle -I nitpicker.init.gradle nitpickerJava` in tests that run without Java.
// In the project directory (cwd): a file `GRADLE_FAIL` makes the run fail with its text, a file
// `NO_REPORTS` makes it succeed without reports (a root project the plugin is not applied to), and each
// line of `violations.txt` becomes one PMD violation in src/main/java/demo/A.java. With
// `-Pnitpicker.kotlin=true` each line of `detekt.txt` becomes one detekt result in
// src/main/kotlin/demo/K.kt (rule `detekt.style.MagicNumber`, or the part before ` :: ` in the line),
// each line of `ktlint.txt` (`rule|message`) one ktlint result there and each line of
// `kotlin-format.txt` a file ktfmt would change, a file `kotlin-metrics.json` is the Kotlin metrics
// report as it is, a file `jacoco.xml` becomes the JaCoCo report and a file `mutations.xml` the PIT
// report. The arguments are kept in build/nitpicker/gradle-args.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('GRADLE_FAIL')) {
  process.stderr.write(`${readFileSync('GRADLE_FAIL', 'utf8')}\n`);
  process.exit(1);
}
if (existsSync('NO_REPORTS')) {
  process.exit(0);
}
const lines = (file) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
const violations = lines('violations.txt');
mkdirSync('build/nitpicker', { recursive: true });
const sarif = (name, results) =>
  JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
const kotlin = process.argv.includes('-Pnitpicker.kotlin=true');
const formatterArgument = process.argv.find((argument) =>
  argument.startsWith('-Pnitpicker.kotlin.formatter='),
);
writeFileSync('build/nitpicker/gradle-args.json', JSON.stringify(process.argv.slice(2)));
writeFileSync(
  'build/nitpicker/manifest.json',
  JSON.stringify({
    versions: {},
    sourceRoots: ['src/main/java'],
    ...(kotlin && {
      kotlin: true,
      kotlinSourceRoots: ['src/main/kotlin'],
      kotlinFormatter: formatterArgument?.split('=')[1] ?? 'none',
    }),
  }),
);
if (kotlin) {
  writeFileSync(
    'build/nitpicker/detekt.sarif',
    sarif(
      'detekt',
      lines('detekt.txt').map((line, index) => ({
        ruleId: line.includes(' :: ') ? line.split(' :: ')[0] : 'detekt.style.MagicNumber',
        level: 'warning',
        message: { text: line.includes(' :: ') ? line.split(' :: ')[1] : line },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'src/main/kotlin/demo/K.kt' },
              region: { startLine: index + 3 },
            },
          },
        ],
      })),
    ),
  );
  writeFileSync(
    'build/nitpicker/ktlint.sarif',
    sarif(
      'ktlint',
      lines('ktlint.txt').map((line, index) => ({
        ruleId: line.split('|')[0],
        level: 'error',
        message: { text: line.split('|')[1] },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: 'src/main/kotlin/demo/K.kt' },
              region: { startLine: index + 3 },
            },
          },
        ],
      })),
    ),
  );
  writeFileSync('build/nitpicker/ktfmt.txt', lines('kotlin-format.txt').join('\n'));
  if (existsSync('kotlin-metrics.json')) {
    writeFileSync('build/nitpicker/kotlin-metrics.json', readFileSync('kotlin-metrics.json'));
  }
}
writeFileSync(
  'build/nitpicker/pmd.sarif',
  sarif(
    'PMD',
    violations.map((text, index) => ({
      ruleId: 'UnusedPrivateField',
      message: { text },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'src/main/java/demo/A.java' },
            region: { startLine: index + 3 },
          },
        },
      ],
    })),
  ),
);
writeFileSync('build/nitpicker/spotbugs.sarif', sarif('SpotBugs', []));
writeFileSync('build/nitpicker/format.txt', '');
writeFileSync('build/nitpicker/checkstyle.xml', '<checkstyle version="10.21.1"></checkstyle>');
writeFileSync(
  'build/nitpicker/jacoco.xml',
  existsSync('jacoco.xml') ? readFileSync('jacoco.xml') : '<report name="demo"></report>',
);
if (existsSync('mutations.xml')) {
  mkdirSync('build/nitpicker/pit', { recursive: true });
  writeFileSync('build/nitpicker/pit/mutations.xml', readFileSync('mutations.xml'));
}
writeFileSync('build/nitpicker/lizard.csv', '');
