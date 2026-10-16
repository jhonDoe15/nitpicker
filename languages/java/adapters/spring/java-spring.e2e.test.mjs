import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'spring-project');
const SPRING_RULE = /^(?:Spring|Jpa)/;
const VIOLATION_MARKER = /\/\/ violation: (.*)$/;
const CHECKSTYLE_VERSION = /<checkstyle version="([^"]+)">/;

function javaFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(root, name));
}

function expectedViolations(sourceRoot) {
  return javaFiles(sourceRoot)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const marker = VIOLATION_MARKER.exec(line);
          return marker === null
            ? []
            : marker[1]
                .split(',')
                .map(
                  (rule) =>
                    `${path.relative(sourceRoot, file).split(path.sep).join('/')}:${String(index + 1)} ${rule.trim()}`,
                );
        }),
    )
    .sort();
}

function reportedViolations(sarifFile, sourceRoot) {
  const [run] = JSON.parse(readFileSync(sarifFile, 'utf8')).runs;
  return run.results
    .filter((result) => SPRING_RULE.test(result.ruleId))
    .map((result) => {
      const { artifactLocation, region } = result.locations[0].physicalLocation;
      const file = path.relative(sourceRoot, new URL(artifactLocation.uri).pathname);
      return `${file.split(path.sep).join('/')}:${String(region.startLine)} ${result.ruleId}`;
    })
    .sort();
}

describe.skipIf(!enabled)('Spring rules on a Spring project', () => {
  let projectRoot;

  beforeAll(
    () => {
      projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-')), 'shop');
      cpSync(fixture, projectRoot, { recursive: true });
      const result = spawnSync(
        gradle,
        ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd', 'nitpickerJava'],
        { cwd: projectRoot, encoding: 'utf8', timeout: 15 * 60 * 1000 },
      );
      if (result.status !== 0) {
        throw new Error(`Gradle failed: ${result.stderr}`);
      }
    },
    16 * 60 * 1000,
  );

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports exactly the violations marked in the fixture sources', () => {
    const sourceRoot = path.join(projectRoot, 'src', 'main', 'java');
    expect(
      reportedViolations(path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'), sourceRoot),
    ).toEqual(expectedViolations(sourceRoot));
  });

  it('runs the pinned Checkstyle with the bundled config even when the project declares its own', () => {
    const report = readFileSync(
      path.join(projectRoot, 'build', 'nitpicker', 'checkstyle.xml'),
      'utf8',
    );
    expect(CHECKSTYLE_VERSION.exec(report)?.[1]).toBe('10.21.1');
  });

  it('reports no FieldCanBeFinal in JPA entities and no utility-class finding on configuration classes', () => {
    const findings = readErrorProneFindings({
      reportRoot: path.join(projectRoot, 'build', 'nitpicker'),
      roots: [projectRoot],
      lintedRoots: ['src/main/java', 'src/test/java'],
    });
    expect(
      findings.map(({ rule, path: file, location }) => `${file}:${location.line} ${rule}`),
    ).toEqual(['src/main/java/shop/catalog/ProductRepository.java:11 MissingOverride']);
  });

  it('records the resource roots and that the project uses Spring', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'manifest.json'), 'utf8'),
    );
    expect({ spring: manifest.spring, resourceRoots: manifest.resourceRoots }).toEqual({
      spring: true,
      resourceRoots: ['src/main/resources'],
    });
  });
});
