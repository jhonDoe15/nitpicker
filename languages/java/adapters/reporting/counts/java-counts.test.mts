import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import {
  callUntyped,
  findingsOf as javaFindings,
  type JavaFinding,
} from '../../typed/java-values.mts';
import {
  javaFindingsOf,
  projectWithKotlinReports,
  removeTemporaryProjects,
  rootReports,
} from '../__tests__/kotlin-report-project.mts';
import { withJavaCountRatchets } from './java-counts.mts';
import { isJavaTouchedRule } from '../../touched-rules.mts';

afterEach(removeTemporaryProjects);

const FILE = 'src/main/java/demo/Legacy.java';

type Writer = (root: string) => void;
type Range = readonly [number, number];
type Counts = {
  readonly newFindings: JavaFinding[];
  readonly resolvedFindings: JavaFinding[];
  readonly unchangedFindings: JavaFinding[];
};
type MethodSpec = {
  readonly name: string;
  readonly parameter?: string;
  readonly lines: number;
  readonly body?: readonly string[];
};

function comparedOf(request: object): Counts {
  const result = callUntyped(compareFindings, request);
  return {
    newFindings: javaFindings(fieldOf(result, 'newFindings')),
    resolvedFindings: javaFindings(fieldOf(result, 'resolvedFindings')),
    unchangedFindings: javaFindings(fieldOf(result, 'unchangedFindings')),
  };
}

function checkstyleOf(
  root: string,
  source: string,
  message: string | readonly string[],
  line: number | readonly number[] = 4,
): void {
  writeFileSync(
    path.join(rootReports(root), 'checkstyle.xml'),
    `<checkstyle version="10.21.1"><file name="${path.join(root, FILE)}">${[message]
      .flat()
      .map(
        (text, index) =>
          `<error line="${String([line].flat()[index])}" severity="warning" message="${text}" source="com.puppycrawl.tools.checkstyle.checks.${source}"/>`,
      )
      .join('')}</file></checkstyle>`,
  );
}

function pmdOf(root: string, ruleId: string, text: string): void {
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

function findingsOf(write: Writer): JavaFinding[] {
  const root = projectWithKotlinReports();
  write(root);
  return javaFindingsOf(root).filter(({ tool }) => ['checkstyle', 'pmd'].includes(tool));
}

const untouched = {
  changedLines: new Map([[FILE, { added: false, ranges: [[20, 20]], inserted: [[20, 20]] }]]),
  isStrictRule: () => true,
};

function compare(base: Writer, head: Writer): Counts {
  return comparedOf({
    baseFindings: findingsOf(base),
    headFindings: findingsOf(head),
    touchedCode: untouched,
  });
}

function methodLength(lines: number): Writer {
  return (root) => {
    checkstyleOf(
      root,
      'sizes.MethodLengthCheck',
      `Method pick length is ${String(lines)} lines (max allowed is 150).`,
    );
  };
}

function literal(times: number, line: number): Writer {
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

    expect(newFindings.map(({ message }) => textOf(message).split('. ')[0])).toEqual([
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

  it('fails a method whose count grew after the method above it with the same message was removed', () => {
    function complexity(counts: readonly number[], lines: readonly number[]): Writer {
      return (root) => {
        writeFileSync(
          path.join(rootReports(root), 'structure.json'),
          JSON.stringify([
            {
              file: FILE,
              name: 'Legacy.first',
              start: 8,
              end: 20,
              lines: 13,
              complexity: 20,
              signature: 'Legacy.first()',
            },
            {
              file: FILE,
              name: 'Legacy.second',
              start: 35,
              end: 50,
              lines: 16,
              complexity: 11,
              signature: 'Legacy.second()',
            },
          ]),
        );
        checkstyleOf(
          root,
          'metrics.CyclomaticComplexityCheck',
          counts.map((count) => `Cyclomatic Complexity is ${String(count)} (max allowed is 10).`),
          lines,
        );
      };
    }

    const { newFindings } = compare(complexity([20, 11], [10, 40]), complexity([15], [40]));

    expect(newFindings.map(({ message }) => textOf(message).split('. ')[0])).toEqual([
      'Cyclomatic complexity grew from 11 to 15',
    ]);
  });

  it.each<[string, string, string, number]>([
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
    const [finding] = listOf(
      withJavaCountRatchets([
        {
          tool,
          rule: tool === 'pmd' ? rule : `com.puppycrawl.tools.checkstyle.checks.${rule}`,
          path: FILE,
          identity: 'id',
          message,
        },
      ]),
    );

    expect(fieldOf(fieldOf(finding, 'ratchet'), 'value')).toBe(value);
  });

  it('keys a data abstraction coupling by class, not by the classes it lists', () => {
    function keyOf(classes: string): unknown {
      return fieldOf(
        fieldOf(
          listOf(
            withJavaCountRatchets([
              {
                tool: 'checkstyle',
                rule: 'ClassDataAbstractionCoupling',
                path: FILE,
                identity: 'id',
                message: `Class Data Abstraction Coupling is 8 (max allowed is 7) classes [${classes}].`,
              },
            ]),
          )[0],
          'ratchet',
        ),
        'key',
      );
    }

    expect(keyOf('A, B')).toBe(keyOf('A, C'));
  });
});

type Unit = {
  readonly declaration: string;
  readonly name: string;
  readonly parameter: string;
  readonly lines: number;
  readonly body: readonly string[];
};

describe('Java count findings on a renamed or overloaded legacy method', () => {
  const BODY = ['    int total = 0;', '    total += flag;', '    return total;', '  }'];

  function method({ name, parameter = 'int flag', lines, body = BODY }: MethodSpec): Unit {
    return { declaration: `  int ${name}(${parameter}) {`, name, parameter, lines, body };
  }

  function legacyClass(...methods: readonly Unit[]): Writer {
    return (root) => {
      const source = ['package demo;', '', 'class Legacy {'];
      const units: (Unit & { start: number })[] = [];
      for (const each of methods) {
        units.push({ ...each, start: source.length + 1 });
        source.push(each.declaration, ...each.body);
      }
      writeFileSync(path.join(root, FILE), `${[...source, '}'].join('\n')}\n`);
      writeFileSync(
        path.join(rootReports(root), 'structure.json'),
        JSON.stringify(
          units.map((unit) => ({
            file: FILE,
            name: `Legacy.${unit.name}`,
            start: unit.start,
            end: unit.start + unit.body.length,
            lines: unit.body.length + 1,
            complexity: 1,
            signature: `Legacy.${unit.name}(${unit.parameter.split(' ')[0] ?? ''})`,
          })),
        ),
      );
      checkstyleOf(
        root,
        'sizes.MethodLengthCheck',
        units.map(
          (unit) =>
            `Method ${unit.name} length is ${String(unit.lines)} lines (max allowed is 150).`,
        ),
        units.map((unit) => unit.start),
      );
    };
  }

  function compareTouched(
    base: Writer,
    head: Writer,
    ranges: readonly Range[],
    inserted: readonly Range[] = [],
  ): Counts {
    return comparedOf({
      baseFindings: findingsOf(base),
      headFindings: findingsOf(head),
      touchedCode: {
        changedLines: new Map([[FILE, { added: false, ranges, inserted }]]),
        isStrictRule: isJavaTouchedRule,
      },
    });
  }

  it('keeps the count of a method renamed without other edits', () => {
    const result = compareTouched(
      legacyClass(method({ name: 'pick', lines: 160 })),
      legacyClass(method({ name: 'choose', lines: 160 })),
      [[4, 4]],
    );

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings.map(({ message }) => textOf(message).split(' (')[0])).toEqual([
      'Method choose length is 160 lines',
    ]);
  });

  it('fails a renamed method whose count grew', () => {
    const grown = [
      '    int total = 0;',
      '    total += flag;',
      '    total += flag;',
      ...BODY.slice(2),
    ];
    const result = compareTouched(
      legacyClass(method({ name: 'pick', lines: 160 })),
      legacyClass(method({ name: 'choose', lines: 161, body: grown })),
      [[4, 4]],
      [[7, 7]],
    );

    expect(result.newFindings.map(({ message }) => textOf(message).split(' (')[0])).toEqual([
      'Method choose length is 161 lines',
    ]);
    expect(result.resolvedFindings.map(({ message }) => textOf(message).split(' (')[0])).toEqual([
      'Method pick length is 160 lines',
    ]);
  });

  it('holds an edited method by its declaration when an overload is added above it', () => {
    const edited = ['    int total = 1;', ...BODY.slice(1)];
    const result = compareTouched(
      legacyClass(method({ name: 'pick', lines: 160 })),
      legacyClass(
        method({ name: 'pick', parameter: 'String text', lines: 155 }),
        method({ name: 'pick', lines: 158, body: edited }),
      ),
      [[4, 9]],
      [[4, 8]],
    );

    expect(result.newFindings.map(({ message }) => textOf(message).split(' (')[0])).toEqual([
      'Method pick length is 155 lines',
    ]);
    expect(result.newFindings[0]?.location?.line).toBe(4);
    expect(
      result.unchangedFindings.map(({ location, heldAtBase }) => [location?.line, heldAtBase]),
    ).toEqual([[9, 160]]);
  });
});
