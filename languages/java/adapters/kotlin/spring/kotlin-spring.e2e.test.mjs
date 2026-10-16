import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import {
  EXPECTED_CONFIG_AND_ARCHITECTURE,
  GRADLE_FILES,
  markedViolations,
  writeKotlinSpringProject,
} from './test-support/kotlin-spring-projects.mjs';

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
        .filter(({ tool, rule }) => tool === 'spring' && SPRING_RULE.test(rule))
        .map(
          ({ path: file, location, rule }) =>
            `${path.basename(file)}:${String(location.line)} ${rule}`,
        )
        .toSorted(),
    ).toEqual(markedViolations().toSorted());
  });

  it('checks the Spring configuration files and resolves ArchUnit violations to the Kotlin source', () => {
    expect(
      findings
        .filter(
          ({ tool, rule }) => tool === 'archunit' || (tool === 'spring' && !SPRING_RULE.test(rule)),
        )
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`)
        .toSorted(),
    ).toEqual(EXPECTED_CONFIG_AND_ARCHITECTURE);
  });
});
