import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { findingsOf, type JavaFinding } from '../typed/java-values.mts';
import { readJavaFindings as readFindings } from './java-reports.mts';
import {
  readingFrom,
  reportBaseOf,
  rootReports,
  writeModules,
} from '../test-support/report-base.mts';

const readJavaFindings = readingFrom(readFindings);
const { temporaryRoot } = useGitFixtures();

function emptyProject(): string {
  const root = temporaryRoot('nitpicker-java-spring-');
  mkdirSync(rootReports(root), { recursive: true });
  writeModules(root);
  const reports = rootReports(root);
  function sarif(name: string): string {
    return JSON.stringify({ runs: [{ tool: { driver: { name, rules: [] } }, results: [] }] });
  }
  writeFileSync(path.join(reports, 'jacoco.xml'), '<report name="demo"></report>');
  writeFileSync(path.join(reports, 'pmd.sarif'), sarif('PMD'));
  writeFileSync(path.join(reports, 'spotbugs.sarif'), sarif('SpotBugs'));
  writeFileSync(path.join(reports, 'format.txt'), '');
  writeFileSync(path.join(reports, 'checkstyle.xml'), '<checkstyle></checkstyle>');
  writeFileSync(path.join(reports, 'structure.json'), '[]');
  writeFileSync(path.join(reports, 'classes.json'), JSON.stringify({ files: {}, classes: [] }));
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  return root;
}

function qaProfileProject(): string {
  const root = emptyProject();
  mkdirSync(path.join(root, 'src/main/resources'), { recursive: true });
  mkdirSync(path.join(root, 'src/test/java'), { recursive: true });
  writeFileSync(
    path.join(root, 'src/main/resources/application.yml'),
    'spring:\n  config:\n    activate:\n      on-profile: qa\n  jpa:\n    hibernate:\n      ddl-auto: create-drop\n',
  );
  writeFileSync(
    path.join(root, 'src/test/java/EnvTest.java'),
    '@ActiveProfiles("qa")\nclass EnvTest {}\n',
  );
  writeFileSync(
    path.join(rootReports(root), 'manifest.json'),
    JSON.stringify({ sourceRoots: [], spring: true, testSourceRoots: ['src/test/java'] }),
  );
  return root;
}

describe('readJavaFindings: Spring test profiles', () => {
  function springFiles(findings: readonly JavaFinding[]): string[][] {
    return findings
      .filter(({ tool }) => tool === 'spring')
      .map(({ rule, path: file }) => [rule, file]);
  }

  it('measures the profiles the tests use on the baseline checkout only for the head snapshot', () => {
    const root = qaProfileProject();
    const baselineRoot = emptyProject();
    function read(baseline: object | undefined): string[][] {
      return springFiles(findingsOf(readJavaFindings(root, { baseline }).findings));
    }

    expect(read(undefined)).toEqual([]);
    expect(read({ snapshot: 'base', baselineRoot })).toEqual([]);
    expect(read({ snapshot: 'head', baselineRoot })).toEqual([
      ['ddl-auto', 'src/main/resources/application.yml'],
    ]);
  });
});

function mixedProject(files: Readonly<Record<string, string>>): string {
  const root = emptyProject();
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  writeFileSync(
    path.join(rootReports(root), 'manifest.json'),
    JSON.stringify({
      sourceRoots: ['src/main/java'],
      kotlinSourceRoots: ['src/main/java', 'src/main/kotlin'],
      spring: true,
    }),
  );
  return root;
}

describe('readJavaFindings: Spring sources in Kotlin', () => {
  const SCHEDULED = 'import org.springframework.scheduling.annotation.Scheduled\n';
  function missingEnable(root: string): string[] {
    return findingsOf(readJavaFindings(root).findings)
      .filter(({ rule }) => rule === 'missing-enable')
      .map(({ path: file, location }) => `${file}:${String(location?.line)}`);
  }

  it('reads the Kotlin source roots for an annotation that needs an @Enable', () => {
    const root = mixedProject({
      'src/main/kotlin/shop/Jobs.kt': `${SCHEDULED}class Jobs {\n  @Scheduled(fixedDelay = 1000)\n  fun run() {}\n}\n`,
    });

    expect(missingEnable(root)).toEqual(['src/main/kotlin/shop/Jobs.kt:3']);
  });

  it('finds the @Enable annotation in a Kotlin class', () => {
    const root = mixedProject({
      'src/main/kotlin/shop/App.kt':
        'import org.springframework.scheduling.annotation.EnableScheduling\n@EnableScheduling\nclass App\n',
      'src/main/java/shop/Jobs.java': `${SCHEDULED};class Jobs {\n  @Scheduled(fixedDelay = 1000)\n  void run() {}\n}\n`,
    });

    expect(missingEnable(root)).toEqual([]);
  });
});
