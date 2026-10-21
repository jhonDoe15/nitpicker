import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import {
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from '../test-support/kotlin-report-project.mjs';

const RULE = 'detekt.complexity.StringLiteralDuplication';
const MESSAGE =
  'Multiple occurrences of the same string literal within a single file detected. Prefer extracting the string literal into a property or constant.';

afterEach(removeTemporaryProjects);

function resultFor(file, line, ruleId = RULE) {
  return {
    level: 'warning',
    ruleId,
    message: { text: MESSAGE },
    locations: [23, 34, 45].map((column) => ({
      physicalLocation: {
        artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
        region: { startLine: line, startColumn: column, endLine: line, endColumn: column + 9 },
      },
    })),
  };
}

function findingsFrom(results, testRoots = ['checks/kotlin/']) {
  const root = projectWithKotlinReports({
    manifest: { kotlinTestSourceRoots: testRoots },
  });
  writeFileSync(
    path.join(rootReports(root), 'detekt.sarif'),
    JSON.stringify({ runs: [{ tool: { driver: { name: 'detekt' } }, results }] }),
  );
  return kotlinFindings(root, 'detekt');
}

describe('Kotlin repeated string findings', () => {
  it.each(['.', 'checks\\kotlin'])('normalizes declared test root %s', (testRoot) => {
    expect(findingsFrom([resultFor('checks/kotlin/Labels.kt', 2)], [testRoot])).toEqual([]);
  });

  it('exempts declared test roots without exempting siblings or other test rules', () => {
    const findings = findingsFrom([
      resultFor('checks/kotlin/Labels.kt', 2),
      resultFor('checks/kotlinExtra/Labels.kt', 2),
      resultFor('checks/kotlin/Labels.kt', 3, 'detekt.potential-bugs.UnsafeCallOnNullableType'),
    ]);

    expect(findings.map(({ path: file, rule }) => [file, rule])).toEqual([
      ['checks/kotlinExtra/Labels.kt', RULE],
      ['checks/kotlin/Labels.kt', 'detekt.potential-bugs.UnsafeCallOnNullableType'],
    ]);
  });

  it('keeps moved findings stable and names the constant and exception route', () => {
    const baseFindings = findingsFrom([resultFor('src/main/kotlin/demo/Bad.kt', 2)]);
    const headFindings = findingsFrom([resultFor('src/main/kotlin/demo/Bad.kt', 8)]);
    const result = compareFindings({ baseFindings, headFindings });

    expect(result.newFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
    expect(headFindings[0].message).toBe(
      `${MESSAGE} Name a constant and reuse it so changes stay consistent. To allow it on specific paths, add an "exceptions" entry for rule ${RULE} in nitpicker.config.json.`,
    );
    expect(headFindings[0].classification).toBe('enforceable');
  });
});
