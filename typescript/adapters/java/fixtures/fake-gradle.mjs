#!/usr/bin/env node
// Stand-in for `gradle -I nitpicker.init.gradle nitpickerJava` in tests that run without Java.
// In the project directory (cwd): a file `GRADLE_FAIL` makes the run fail with its text, and each
// line of `violations.txt` becomes one PMD violation in src/main/java/demo/A.java.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('GRADLE_FAIL')) {
  process.stderr.write(`${readFileSync('GRADLE_FAIL', 'utf8')}\n`);
  process.exit(1);
}
const violations = existsSync('violations.txt')
  ? readFileSync('violations.txt', 'utf8').split('\n').filter(Boolean)
  : [];
mkdirSync('build/nitpicker', { recursive: true });
const sarif = (name, results) =>
  JSON.stringify({ runs: [{ tool: { driver: { name } }, results }] });
writeFileSync(
  'build/nitpicker/manifest.json',
  JSON.stringify({ versions: {}, sourceRoots: ['src/main/java'] }),
);
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
writeFileSync('build/nitpicker/jacoco.xml', '<report name="demo"></report>');
