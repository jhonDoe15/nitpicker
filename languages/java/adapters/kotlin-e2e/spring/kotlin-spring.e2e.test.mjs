import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  configAndArchitectureOf,
  EXPECTED_CONFIG_AND_ARCHITECTURE,
  EXPECTED_SPRING_ARCHITECTURE,
  springArchitectureOf,
  GRADLE_FILES,
  markedViolations,
  writeKotlinSpringProject,
} from '../../kotlin/spring/test-support/kotlin-spring-projects.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const SPRING_RULE = /^(?:Spring|Jpa)/;

describe.skipIf(!enabled)('Kotlin Spring rules on a Gradle project end to end', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-'));
    writeKotlinSpringProject(root, GRADLE_FILES);
    findings = collectJavaFindings(root, { gradle, policy: { preset: 'kotlin' } });
  });
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports exactly the violations marked in the Kotlin sources', () => {
    expect(
      findings
        .filter(({ tool, rule }) => tool === 'pmd' && SPRING_RULE.test(rule))
        .map(
          ({ path: file, location, rule }) =>
            `${path.basename(file)}:${String(location.line)} ${rule}`,
        )
        .toSorted(),
    ).toEqual(markedViolations().toSorted());
  });

  it('checks the Spring configuration files and resolves the ArchUnit and Spring architecture violations to the Kotlin source', () => {
    expect(configAndArchitectureOf(findings)).toEqual(EXPECTED_CONFIG_AND_ARCHITECTURE);
    expect(springArchitectureOf(findings)).toEqual(EXPECTED_SPRING_ARCHITECTURE);
  });
});
