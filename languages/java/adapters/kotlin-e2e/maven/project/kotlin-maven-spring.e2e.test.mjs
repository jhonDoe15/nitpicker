import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../../java-diff.mjs';
import {
  EXPECTED_CONFIG_AND_ARCHITECTURE,
  MAVEN_FILES,
  markedViolations,
  writeKotlinSpringProject,
} from '../../../kotlin/spring/test-support/kotlin-spring-projects.mjs';
import { kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-maven-project.mjs';

const maven = process.env.NITPICKER_MAVEN;

const SPRING_RULE = /^(?:Spring|Jpa)/;

describe.skipIf(!kotlinE2eEnabled)('Kotlin Spring rules on a Maven project end to end', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-maven-'));
    writeKotlinSpringProject(root, MAVEN_FILES);
    findings = collectJavaFindings(root, { maven, policy: kotlinPolicy });
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
