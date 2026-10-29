import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import {
  projectWithKotlinReports,
  readJavaFindings,
  removeTemporaryProjects,
  rootReports,
} from '../test-support/kotlin-report-project.mjs';
import { withJavaCountRatchets } from './java-counts.mjs';

afterEach(removeTemporaryProjects);

const FILE = 'src/main/java/demo/Legacy.java';

function checkstyleOf(root, source, message) {
  writeFileSync(
    path.join(rootReports(root), 'checkstyle.xml'),
    `<checkstyle version="10.21.1"><file name="${path.join(root, FILE)}"><error line="4" severity="warning" message="${message}" source="com.puppycrawl.tools.checkstyle.checks.${source}"/></file></checkstyle>`,
  );
}

function pmdOf(root, ruleId, text) {
  const result = {
    ruleId,
    message: { text },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `file://${path.join(root, FILE)}` },
          region: { startLine: 4 },
        },
      },
    ],
  };
  writeFileSync(
    path.join(rootReports(root), 'pmd.sarif'),
    JSON.stringify({ runs: [{ tool: { driver: { name: 'PMD', rules: [] } }, results: [result] }] }),
  );
}

function findingsOf(write) {
  const root = projectWithKotlinReports();
  write(root);
  return readJavaFindings(root).findings.filter(({ tool }) => ['checkstyle', 'pmd'].includes(tool));
}

const untouched = {
  changedLines: new Map([[FILE, { added: false, ranges: [[20, 20]], inserted: [[20, 20]] }]]),
  isStrictRule: () => true,
};

function compare(base, head) {
  return compareFindings({
    baseFindings: findingsOf(base),
    headFindings: findingsOf(head),
    touchedCode: untouched,
  });
}

function methodLength(lines) {
  return (root) => {
    checkstyleOf(
      root,
      'sizes.MethodLengthCheck',
      `Method pick length is ${String(lines)} lines (max allowed is 150).`,
    );
  };
}

function literal(times, line) {
  return (root) => {
    pmdOf(
      root,
      'AvoidDuplicateLiterals',
      `The String literal "x" appears ${String(times)} times in this file; the first occurrence is on line ${String(line)}`,
    );
  };
}

describe('Java count findings on legacy code', () => {
  it('fails a Checkstyle method length that grew and says from what', () => {
    const { newFindings } = compare(methodLength(160), methodLength(161));

    expect(newFindings.map(({ message }) => message.split('. ')[0])).toEqual([
      'Lines grew from 160 to 161',
    ]);
  });

  it('holds a Checkstyle method length that fell but is still over the limit', () => {
    const { newFindings, unchangedFindings } = compare(methodLength(161), methodLength(160));

    expect(newFindings).toEqual([]);
    expect(unchangedFindings.map(({ heldAtBase }) => heldAtBase)).toEqual([161]);
  });

  it('holds a repeated PMD literal that is repeated less and moved', () => {
    const { newFindings, resolvedFindings } = compare(literal(5, 3), literal(4, 9));

    expect(newFindings).toEqual([]);
    expect(resolvedFindings).toEqual([]);
  });

  it('fails a repeated PMD literal that is repeated more', () => {
    expect(compare(literal(4, 3), literal(5, 3)).newFindings).toHaveLength(1);
  });

  it.each([
    ['checkstyle', 'sizes.ParameterNumberCheck', 'More than 7 parameters (found 9).', 9],
    [
      'checkstyle',
      'metrics.NPathComplexityCheck',
      'NPath Complexity is 1,250 (max allowed is 200).',
      1250,
    ],
    [
      'checkstyle',
      'coding.ReturnCountCheck',
      'Return count is 4 (max allowed for non-void methods/lambdas is 2).',
      4,
    ],
    ['checkstyle', 'design.ThrowsCountCheck', 'Throws count is 5 (max allowed is 4).', 5],
    ['checkstyle', 'metrics.JavaNCSSCheck', 'NCSS for this method is 51 (max allowed is 50).', 51],
    ['checkstyle', 'coding.NestedIfDepthCheck', 'Nested if-else depth is 3 (max allowed is 1).', 3],
    [
      'checkstyle',
      'sizes.MethodCountCheck',
      'Total number of methods is 120 (max allowed is 100).',
      120,
    ],
    [
      'checkstyle',
      'metrics.ClassDataAbstractionCouplingCheck',
      'Class Data Abstraction Coupling is 8 (max allowed is 7) classes [A, B].',
      8,
    ],
    [
      'checkstyle',
      'coding.MultipleStringLiteralsCheck',
      'The String "x" appears 4 times in the file.',
      4,
    ],
    [
      'checkstyle',
      'coding.VariableDeclarationUsageDistanceCheck',
      "Distance between variable 'x' declaration and its first usage is 5, but allowed 3.",
      5,
    ],
    [
      'pmd',
      'CognitiveComplexity',
      "The method 'pick' has a cognitive complexity of 16, current threshold is 15",
      16,
    ],
    ['pmd', 'CyclomaticComplexity', "The method 'pick' has a cyclomatic complexity of 12.", 12],
    [
      'pmd',
      'NPathComplexity',
      "The method 'pick' has an NPath complexity of 300, current threshold is 200",
      300,
    ],
    ['pmd', 'NcssCount', "The method 'pick' has a NCSS line count of 61.", 61],
    [
      'pmd',
      'CouplingBetweenObjects',
      'A value of 21 may denote a high amount of coupling within the class (threshold: 20)',
      21,
    ],
  ])('reads the count of %s %s from its message', (tool, rule, message, value) => {
    const [finding] = withJavaCountRatchets([
      {
        tool,
        rule: tool === 'pmd' ? rule : `com.puppycrawl.tools.checkstyle.checks.${rule}`,
        path: FILE,
        identity: 'id',
        message,
      },
    ]);

    expect(finding.ratchet.value).toBe(value);
  });

  it('keys a data abstraction coupling by class, not by the classes it lists', () => {
    const keyOf = (classes) =>
      withJavaCountRatchets([
        {
          tool: 'checkstyle',
          rule: 'ClassDataAbstractionCoupling',
          path: FILE,
          identity: 'id',
          message: `Class Data Abstraction Coupling is 8 (max allowed is 7) classes [${classes}].`,
        },
      ])[0].ratchet.key;

    expect(keyOf('A, B')).toBe(keyOf('A, C'));
  });
});
