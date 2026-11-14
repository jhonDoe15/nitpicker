import { describe, expect, it } from 'vitest';
import { fieldAt } from '../../../../scripts/json/fields.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import { compareFindings, type ComparedFinding } from '../test-support/typed-compare.mts';
import { branchCoverageFindings as branchCoverageFindingsJs } from '../../../../shared/rules/branch-coverage.mjs';
import {
  declarationLine as declarationLineJs,
  hash as hashJs,
  nameFreeHash as nameFreeHashJs,
} from '../../../../shared/rules/finding-helpers.mjs';
import { crapFindings as crapFindingsJs } from '../../../../shared/rules/crap.mjs';
import { mutantFindings as mutantFindingsJs } from '../../../../shared/rules/mutation.mjs';
import { evaluateStructure as evaluateStructureJs } from '../../../../shared/rules/structure.mjs';

type Fields = Readonly<Record<string, unknown>>;
type Span = readonly [number, number];
type SpansByFile = Readonly<Record<string, readonly Span[]>>;

const hash: (value: string) => string = hashJs;
const nameFreeHash: (text: string, name: string) => string = nameFreeHashJs;
const declarationLine: (text: string) => string = declarationLineJs;
const evaluateStructure: (
  report: { readonly functions: readonly Fields[] },
  tool: string,
) => Fields[] = evaluateStructureJs;
const mutantFindings: (mutants: readonly Fields[], options: { readonly tool: string }) => Fields[] =
  mutantFindingsJs;
const crapFindings: (functions: readonly Fields[], options: { readonly tool: string }) => Fields[] =
  crapFindingsJs;
const branchCoverageFindings: (
  branches: readonly Fields[],
  options: { readonly tool: string; readonly identify: (key: string) => string },
) => Fields[] = branchCoverageFindingsJs;

const BODY = Array.from({ length: 64 }, (_, index) => `total += step(${String(index)});`);

function functionText(declaration: string, body: readonly string[] = BODY): string {
  return [declaration, ...body, 'return total;', '}'].join('\n');
}

function entry({
  file = 'src/A.java',
  name,
  start,
  text,
}: {
  readonly file?: string;
  readonly name: string;
  readonly start: number;
  readonly text: string;
}): Fields {
  return {
    file,
    name,
    start,
    end: start + text.split('\n').length - 1,
    lines: text.split('\n').length,
    sourceHash: hash(text),
    anchorHash: nameFreeHash(text, name),
    declarationHash: hash(declarationLine(text)),
  };
}

function structure(...entries: readonly Fields[]): Fields[] {
  return evaluateStructure({ functions: entries }, 'structure').filter(
    (finding) => fieldOf(finding, 'classification') === 'enforceable',
  );
}

function touched(changes: SpansByFile, inserted: SpansByFile) {
  return {
    changedLines: new Map(
      Object.entries(changes).map(([file, ranges]) => [
        file,
        { added: false, ranges, inserted: inserted[file] ?? [] },
      ]),
    ),
    isStrictRule: () => false,
  };
}

function compare({
  base,
  head,
  changes = {},
  inserted = changes,
  renames,
}: {
  readonly base: readonly Fields[];
  readonly head: readonly Fields[];
  readonly changes?: SpansByFile;
  readonly inserted?: SpansByFile;
  readonly renames?: Map<string, string>;
}) {
  const result = compareFindings({
    baseFindings: base,
    headFindings: head,
    baseToHeadRenames: renames,
    touchedCode: touched(changes, inserted),
  });
  const shown = (finding: ComparedFinding) =>
    `${textOf(fieldOf(finding, 'symbol'))}@${String(fieldAt(finding, 'location', 'line'))}`;
  return {
    added: result.newFindings.map(shown),
    kept: result.unchangedFindings.map(shown),
    resolved: result.resolvedFindings.map(shown),
  };
}

const legacy = functionText('int foo(int a) {');

function withOverloadAbove(secondText: string, changes: SpansByFile, inserted: SpansByFile) {
  const overload = functionText('int foo(String a) {', BODY.toReversed());
  return compare({
    base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
    head: structure(
      entry({ name: 'A.foo', start: 3, text: overload }),
      entry({ name: 'A.foo', start: 70, text: secondText }),
    ),
    changes,
    inserted,
  });
}

describe('function findings matched by their text without the name', () => {
  it('keeps a legacy function when an overload with the same name is added above it', () => {
    expect(
      withOverloadAbove(legacy, { 'src/A.java': [[3, 69]] }, { 'src/A.java': [[3, 69]] }),
    ).toEqual({ added: ['A.foo@3'], kept: ['A.foo@70'], resolved: [] });
  });

  it('keeps it when the function and its class are renamed', () => {
    expect(
      compare({
        base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
        head: structure(
          entry({
            file: 'src/B.java',
            name: 'B.bar',
            start: 10,
            text: functionText('int bar(int a) {'),
          }),
        ),
        changes: { 'src/B.java': [[10, 10]] },
        inserted: {},
        renames: new Map([['src/A.java', 'src/B.java']]),
      }),
    ).toEqual({ added: [], kept: ['B.bar@10'], resolved: [] });
  });

  it('keeps it when the rename rewrites the whole declaration line', () => {
    const method = (name: string) => [`  ${name}() {`, ...BODY, 'return total;', '}'].join('\n');

    expect(
      compare({
        base: structure(entry({ file: 'src/a.ts', name: 'K.run', start: 10, text: method('run') })),
        head: structure(entry({ file: 'src/a.ts', name: 'K.go', start: 10, text: method('go') })),
        changes: { 'src/a.ts': [[10, 10]] },
      }),
    ).toEqual({ added: [], kept: ['K.go@10'], resolved: [] });
  });

  it('reports a copy under a new name while the original stays', () => {
    expect(
      compare({
        base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
        head: structure(
          entry({ name: 'A.foo', start: 10, text: legacy }),
          entry({ name: 'A.bar', start: 80, text: functionText('int bar(int a) {') }),
        ),
        changes: { 'src/A.java': [[80, 146]] },
      }),
    ).toEqual({ added: ['A.bar@80'], kept: ['A.foo@10'], resolved: [] });
  });

  it('reports a new copy of a legacy function that was shrunk below the limit', () => {
    expect(
      compare({
        base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
        head: structure(
          entry({ name: 'A.bar', start: 30, text: functionText('int bar(int a) {') }),
        ),
        changes: { 'src/A.java': [[11, 96]] },
        inserted: { 'src/A.java': [[30, 96]] },
      }),
    ).toEqual({ added: ['A.bar@30'], kept: [], resolved: ['A.foo@10'] });
  });

  it('holds an edited legacy function by its declaration when an overload is added above', () => {
    const edited = functionText('int foo(int a) {', ['total = 1;', ...BODY.slice(1)]);

    expect(
      withOverloadAbove(
        edited,
        {
          'src/A.java': [
            [3, 69],
            [71, 71],
          ],
        },
        { 'src/A.java': [[3, 69]] },
      ),
    ).toEqual({ added: ['A.foo@3'], kept: ['A.foo@70'], resolved: [] });
  });
});

function mutant({
  method,
  line,
  anchor = 'Math|replaced + with -|h1',
}: {
  readonly method: string;
  readonly line: number;
  readonly anchor?: string;
}): Fields {
  return {
    path: 'src/A.java',
    identity: `A|${method}|${anchor}#1`,
    status: 'Survived',
    label: 'Math',
    symbol: `A#${method}`,
    line,
    anchor,
  };
}

describe('mutants and branches matched without their function', () => {
  const base = mutantFindings([mutant({ method: 'foo(II)I', line: 12 })], { tool: 'pit' });

  it('keeps a mutant on an unchanged line when its method takes a new parameter', () => {
    expect(
      compare({
        base,
        head: mutantFindings([mutant({ method: 'foo(III)I', line: 12 })], { tool: 'pit' }),
        changes: { 'src/A.java': [[10, 10]] },
        inserted: {},
      }),
    ).toEqual({ added: [], kept: ['A#foo(III)I@12'], resolved: [] });
  });

  it('reports a mutant whose line moved into a new method', () => {
    expect(
      compare({
        base,
        head: mutantFindings([mutant({ method: 'helper(II)I', line: 30 })], { tool: 'pit' }),
        changes: {
          'src/A.java': [
            [12, 12],
            [28, 31],
          ],
        },
      }),
    ).toEqual({ added: ['A#helper(II)I@30'], kept: [], resolved: ['A#foo(II)I@12'] });
  });

  it('reports a new survivor in an unchanged file that only shares the mutation with a killed one', () => {
    expect(
      compare({
        base,
        head: mutantFindings([mutant({ method: 'other(II)I', line: 40 })], { tool: 'pit' }),
      }),
    ).toEqual({ added: ['A#other(II)I@40'], kept: [], resolved: ['A#foo(II)I@12'] });
  });

  it('reports a renamed function whose score grew', () => {
    const crap = (name: string, value: number) =>
      crapFindings(
        [
          {
            path: 'src/A.java',
            name,
            identity: `function:${name}`,
            ratchetKey: `function:${name}:crap`,
            anchor: 'function:crap:text:h',
            line: 10,
            crap: value,
          },
        ],
        { tool: 'crap' },
      );

    expect(
      compare({
        base: crap('A.foo', 20),
        head: crap('A.bar', 30),
        changes: { 'src/A.java': [[10, 10]] },
        inserted: {},
      }),
    ).toEqual({ added: ['A.bar@10'], kept: [], resolved: [] });
  });

  it('reports growth once when the renamed function takes the name of another legacy function', () => {
    const crap = ({
      name,
      value,
      anchor,
      line,
    }: {
      readonly name: string;
      readonly value: number;
      readonly anchor: string;
      readonly line: number;
    }) =>
      crapFindings(
        [
          {
            path: 'src/A.java',
            name,
            identity: `function:${name}:source:${anchor}`,
            ratchetKey: `function:${name}:crap`,
            anchor: `function:crap:text:${anchor}`,
            line,
            crap: value,
          },
        ],
        { tool: 'crap' },
      );
    const base = [
      ...crap({ name: 'A.foo', value: 20, anchor: 'x', line: 10 }),
      ...crap({ name: 'A.bar', value: 35, anchor: 'y', line: 40 }),
    ];
    const head = crap({ name: 'A.bar', value: 30, anchor: 'x', line: 10 });
    const touchedCode = touched({ 'src/A.java': [[10, 10]] }, {});

    const result = compareFindings({ baseFindings: base, headFindings: head, touchedCode });

    expect(result.newFindings.map((finding) => finding['message'])).toEqual([
      'A.bar CRAP rose from 20 to 30 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/A.java"],"function":"A.bar","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    expect(fieldAt(result.newFindings, 0, 'heldAtBase')).toBeUndefined();
    expect(result.unchangedFindings).toEqual([]);
    expect(result.resolvedFindings.map((finding) => finding['symbol'])).toEqual(['A.bar']);
    expect(fieldAt(result.resolvedFindings, 0, 'ratchet', 'value')).toBe(35);
  });

  it('keeps an uncovered branch when its function is renamed', () => {
    const branch = (symbol: string) =>
      branchCoverageFindings([{ path: 'src/A.java', key: 'k', percent: 50, line: 12, symbol }], {
        tool: 'jacoco',
        identify: (key: string) => key,
      });

    expect(
      compare({
        base: branch('A.foo'),
        head: branch('A.bar'),
        changes: { 'src/A.java': [[10, 10]] },
        inserted: {},
      }),
    ).toEqual({ added: [], kept: ['A.bar@12'], resolved: [] });
  });
});
