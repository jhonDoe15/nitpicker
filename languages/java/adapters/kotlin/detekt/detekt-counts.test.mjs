import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import {
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from '../../reporting/test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

const FILE = 'src/main/kotlin/demo/Bad.kt';

function result(rule, text, line, column = 9) {
  return {
    ruleId: `detekt.${rule}`,
    level: 'warning',
    message: { text },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: FILE },
          region: { startLine: line, startColumn: column },
        },
      },
    ],
  };
}

function detektOf({ results, detektCounts = [] }) {
  const root = projectWithKotlinReports();
  writeFileSync(
    path.join(rootReports(root), 'detekt.sarif'),
    JSON.stringify({ runs: [{ tool: { driver: { name: 'detekt' } }, results }] }),
  );
  writeFileSync(
    path.join(rootReports(root), 'kotlin-metrics.json'),
    JSON.stringify({ functions: [], files: [], types: [], detektCounts }),
  );
  return kotlinFindings(root, 'detekt');
}

const untouched = {
  changedLines: new Map([[FILE, { added: false, ranges: [[20, 21]], inserted: [[20, 21]] }]]),
  isStrictRule: () => true,
};

function compare(base, head) {
  return compareFindings({
    baseFindings: detektOf(base),
    headFindings: detektOf(head),
    touchedCode: untouched,
  });
}

const returns = (count) => ({
  results: [
    result(
      'style.ReturnCount',
      `Function pick has ${String(count)} return statements which exceeds the limit of 2.`,
      6,
    ),
  ],
});

const THROWS_TEXT =
  'Too many throw statements in the function pick. The maximum number of allowed throw statements is 2.';
const throwsAt = (count, line = 6, column = 9) => ({
  results: [result('style.ThrowsCount', THROWS_TEXT, line, column)],
  detektCounts: [{ file: FILE, rule: 'ThrowsCount', line, column, value: count }],
});

describe('detekt count findings on a legacy function', () => {
  it('fails a function whose return count grew and says from what', () => {
    const { newFindings } = compare(returns(3), returns(4));

    expect(newFindings.map(({ message }) => message.split('. ').slice(0, 2).join('. '))).toEqual([
      'Return statements grew from 3 to 4. Function pick has 4 return statements which exceeds the limit of 2',
    ]);
  });

  it('holds a function whose return count fell but is still over the limit', () => {
    const { newFindings, unchangedFindings } = compare(returns(4), returns(3));

    expect(newFindings).toEqual([]);
    expect(unchangedFindings.map(({ heldAtBase }) => heldAtBase)).toEqual([4]);
  });

  it('fails a throw count that grew although detekt leaves the count out of its message', () => {
    const { newFindings } = compare(throwsAt(3), throwsAt(4));

    expect(newFindings.map(({ message }) => message.split('. ')[0])).toEqual([
      'Throw statements grew from 3 to 4',
    ]);
  });

  it('keeps a throw count that did not change', () => {
    const { newFindings, unchangedFindings } = compare(throwsAt(3), throwsAt(3));

    expect(newFindings).toEqual([]);
    expect(unchangedFindings).toHaveLength(1);
  });

  it('finds the measured count on the reported line when the column differs', () => {
    const [finding] = detektOf({
      results: [result('style.ThrowsCount', THROWS_TEXT, 6, 5)],
      detektCounts: [{ file: FILE, rule: 'ThrowsCount', line: 6, column: 9, value: 3 }],
    });

    expect(finding.ratchet.value).toBe(3);
  });

  it('leaves the finding without a ratchet when no measured count matches it', () => {
    const [finding] = detektOf({
      results: [result('style.ThrowsCount', THROWS_TEXT, 6)],
      detektCounts: [{ file: FILE, rule: 'ThrowsCount', line: 7, column: 9, value: 3 }],
    });

    expect(finding.ratchet).toBeUndefined();
  });

  it('holds a parameter list whose parameter was renamed and fails one that grew', () => {
    const parameters = (print, count) => ({
      results: [
        result(
          'complexity.LongParameterList',
          `The function pick(${print}) has too many parameters. The current threshold is set to 6.`,
          6,
          13,
        ),
      ],
      detektCounts: [{ file: FILE, rule: 'LongParameterList', line: 6, column: 13, value: count }],
    });
    const seven = 'a: Int, b: Int, c: Int, d: Int, e: Int, f: Int, g: Int';

    expect(
      compare(parameters(seven, 7), parameters(seven.replace('a:', 'first:'), 7)).newFindings,
    ).toEqual([]);
    expect(
      compare(parameters(seven, 7), parameters(`${seven}, h: Int`, 8)).newFindings.map(
        ({ message }) => message.split('. ')[0],
      ),
    ).toEqual(['Parameters grew from 7 to 8']);
  });

  it.each([
    ['complexity.LongMethod', 'The function pick is too long (61). The maximum length is 60.', 61],
    [
      'complexity.CyclomaticComplexMethod',
      "The function pick appears to be too complex based on Cyclomatic Complexity (complexity: 16). Defined complexity threshold for methods is set to '15'",
      16,
    ],
    [
      'complexity.CognitiveComplexMethod',
      "The function pick appears to be too complex based on Cognitive Complexity (complexity: 17). Defined complexity threshold for methods is set to '15'",
      17,
    ],
    [
      'complexity.ComplexCondition',
      "This condition is too complex (5). Defined complexity threshold for conditions is set to '4'",
      5,
    ],
    [
      'complexity.TooManyFunctions',
      "File '/work/src/main/kotlin/demo/Bad.kt' with '12' functions detected. Defined threshold inside files is set to '11'",
      12,
    ],
    [
      'complexity.NestedScopeFunctions',
      "The scope function 'let' is nested too deeply ('2'). Complexity threshold is set to '1'.",
      2,
    ],
    ['complexity.MethodOverloading', "The method 'pick' is overloaded 7 times.", 7],
    [
      'style.DestructuringDeclarationWithTooManyEntries',
      'The destructuring declaration contains 4 but only 3 are allowed.',
      4,
    ],
  ])('reads the count of %s from its message', (rule, text, value) => {
    const [finding] = detektOf({ results: [result(rule, text, 6)] });

    expect(finding.ratchet.value).toBe(value);
    expect(finding.identity.endsWith(`|value:${String(value)}`)).toBe(true);
  });

  it.each([
    ['complexity.NestedBlockDepth', 'Function pick is nested too deeply.', 'NestedBlockDepth'],
    [
      'complexity.LargeClass',
      'Class Bad is too large. Consider splitting it into smaller pieces.',
      'LargeClass',
    ],
    [
      'style.LoopWithTooManyJumpStatements',
      'The loop contains more than one break or continue statement. The code should be refactored to avoid multiple exit points.',
      'LoopWithTooManyJumpStatements',
    ],
  ])('takes the count of %s from the Kotlin parser step', (rule, text, name) => {
    const [finding] = detektOf({
      results: [result(rule, text, 6)],
      detektCounts: [{ file: FILE, rule: name, line: 6, column: 9, value: 5 }],
    });

    expect(finding.ratchet.value).toBe(5);
  });
});
