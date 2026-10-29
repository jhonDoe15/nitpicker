import { describe, expect, it } from 'vitest';
import { compareFindings } from '../compare.mjs';
import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { declarationLine, hash, nameFreeHash } from '../../../../shared/rules/finding-helpers.mjs';
import { mutantFindings } from '../../../../shared/rules/mutation.mjs';
import { evaluateStructure } from '../../../../shared/rules/structure.mjs';

const BODY = Array.from({ length: 64 }, (_, index) => `total += step(${String(index)});`);

function functionText(declaration, body = BODY) {
  return [declaration, ...body, 'return total;', '}'].join('\n');
}

function entry({ file = 'src/A.java', name, start, text }) {
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

function structure(...entries) {
  return evaluateStructure({ functions: entries }, 'structure').filter(
    ({ classification }) => classification === 'enforceable',
  );
}

function touched(changes) {
  return {
    changedLines: new Map(
      Object.entries(changes).map(([file, ranges]) => [
        file,
        { added: false, ranges, inserted: ranges },
      ]),
    ),
    isStrictRule: () => false,
  };
}

function compare({ base, head, changes = {}, renames }) {
  const result = compareFindings({
    baseFindings: base,
    headFindings: head,
    baseToHeadRenames: renames,
    touchedCode: touched(changes),
  });
  const shown = ({ symbol, location }) => `${symbol}@${String(location?.line)}`;
  return {
    added: result.newFindings.map(shown),
    kept: result.unchangedFindings.map(shown),
    resolved: result.resolvedFindings.map(shown),
  };
}

const legacy = functionText('int foo(int a) {');

describe('function findings matched by their text without the name', () => {
  it('keeps a legacy function when an overload with the same name is added above it', () => {
    const overload = functionText('int foo(String a) {', BODY.toReversed());

    expect(
      compare({
        base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
        head: structure(
          entry({ name: 'A.foo', start: 3, text: overload }),
          entry({ name: 'A.foo', start: 70, text: legacy }),
        ),
        changes: { 'src/A.java': [[3, 69]] },
      }),
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
        renames: new Map([['src/A.java', 'src/B.java']]),
      }),
    ).toEqual({ added: [], kept: ['B.bar@10'], resolved: [] });
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

  it('holds an edited legacy function by its declaration when an overload is added above', () => {
    const edited = functionText('int foo(int a) {', ['total = 1;', ...BODY.slice(1)]);
    const overload = functionText('int foo(String a) {', BODY.toReversed());

    expect(
      compare({
        base: structure(entry({ name: 'A.foo', start: 10, text: legacy })),
        head: structure(
          entry({ name: 'A.foo', start: 3, text: overload }),
          entry({ name: 'A.foo', start: 70, text: edited }),
        ),
        changes: {
          'src/A.java': [
            [3, 69],
            [71, 71],
          ],
        },
      }),
    ).toEqual({ added: ['A.foo@3'], kept: ['A.foo@70'], resolved: [] });
  });
});

function mutant({ method, line, anchor = 'Math|replaced + with -|h1' }) {
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

  it('keeps an uncovered branch when its function is renamed', () => {
    const branch = (symbol) =>
      branchCoverageFindings([{ path: 'src/A.java', key: 'k', percent: 50, line: 12, symbol }], {
        tool: 'jacoco',
        identify: (key) => key,
      });

    expect(
      compare({
        base: branch('A.foo'),
        head: branch('A.bar'),
        changes: { 'src/A.java': [[10, 10]] },
      }),
    ).toEqual({ added: [], kept: ['A.bar@12'], resolved: [] });
  });
});
