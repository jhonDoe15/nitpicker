import { capture } from '../../../common/matches.mts';
import type { ParsedTest } from '../../../common/types.mts';
import { maskSource } from '../../masking/mask.mts';
import { uniqueKeys } from '../../occurrences.mts';
import { measureBody } from '../assertions.mts';
import { parametrizeRows } from './rows.mts';

const CLASS = /^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?/u;
const TEST_FUNCTION = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/u;
const SKIP_DECORATOR =
  /@\s*(?:[\w.]*\.)?(?:skip|skipif|skipIf|skipUnless|xfail|expectedFailure)\b|\bmarks\s*=\s*[\w.]*\b(?:skip|xfail)\b/u;
const MODULE_SKIP = new RegExp(
  [
    String.raw`^pytestmark\s*=.*\b(?:skip|skipif|xfail)\b|^(?:\w+\s*=\s*)?pytest\.importorskip\s*\(|`,
    String.raw`^pytest\.skip\s*\(.*allow_module_level`,
  ].join(''),
  'mu',
);
const TEST_CASE = /\bTestCase\b/u;

type PythonClass = { indent: number; name: string; bases: string; decorators: string[] };

type PythonView = { masked: string[]; kept: string[] };

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? '';
}

function decoratorsAbove(lines: readonly string[], index: number, indent: number): string[] {
  let start = index;
  while (start > 0) {
    const previous = lineAt(lines, start - 1).trim();
    const continues = indentOf(lineAt(lines, start - 1)) > indent || /^[@)\]}]/u.test(previous);
    if (previous === '' || !continues) break;
    start -= 1;
  }
  return lines.slice(start, index);
}

function bracketBalance(line: string): number {
  return [...line].reduce(
    (depth, character) =>
      depth + Number('([{'.includes(character)) - Number(')]}'.includes(character)),
    0,
  );
}

function signatureEnd(lines: readonly string[], index: number): number {
  let depth = bracketBalance(lineAt(lines, index));
  let at = index;
  while (depth > 0 && at + 1 < lines.length) {
    at += 1;
    depth += bracketBalance(lineAt(lines, at));
  }
  return at;
}

function bodyEnd(lines: readonly string[], index: number, indent: number): number {
  const signature = signatureEnd(lines, index);
  let end = signature + 1;
  let last = signature;
  while (end < lines.length) {
    if (!isBlank(lineAt(lines, end))) {
      if (indentOf(lineAt(lines, end)) <= indent) break;
      last = end;
    }
    end += 1;
  }
  return last + 1;
}

function shapeOf(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

function isCollectedClass({ name, bases }: PythonClass): boolean {
  return name.startsWith('Test') || TEST_CASE.test(bases);
}

function buildTest({
  declared,
  view,
  index,
  enclosing,
}: {
  declared: RegExpExecArray;
  view: PythonView;
  index: number;
  enclosing: readonly PythonClass[];
}): ParsedTest {
  const indent = capture(declared, 1).length;
  const name = capture(declared, 2);
  const end = bodyEnd(view.masked, index, indent);
  const decorators = decoratorsAbove(view.masked, index, indent);
  const measured = measureBody('python', {
    masked: view.masked.slice(index, end).join('\n'),
    kept: view.kept.slice(index, end).join('\n'),
  });
  const decorated = [...decorators, ...enclosing.flatMap((entry) => entry.decorators)];
  return {
    rows: parametrizeRows(decorators.join('\n')),
    collected: enclosing.every(isCollectedClass),
    key: [...enclosing.map((entry) => entry.name), name].join('.'),
    line: index + 1,
    shape: shapeOf(view.kept.slice(index + 1, end)),
    source: view.kept.slice(index - decorators.length, end).join('\n'),
    ...measured,
    skipped: measured.skipped || decorated.some((line) => SKIP_DECORATOR.test(line)),
  };
}

export function parsePythonTests(text: string): ParsedTest[] {
  const view: PythonView = {
    masked: maskSource('python', text).masked.split('\n'),
    kept: maskSource('python', text, { keepStrings: true }).masked.split('\n'),
  };
  const moduleSkipped = MODULE_SKIP.test(view.masked.join('\n'));
  const enclosing: PythonClass[] = [];
  const tests: ParsedTest[] = [];
  for (const [index, line] of view.masked.entries()) {
    if (isBlank(line)) continue;
    for (
      let last = enclosing.at(-1);
      last !== undefined && last.indent >= indentOf(line);
      last = enclosing.at(-1)
    ) {
      enclosing.pop();
    }
    const declared = CLASS.exec(line);
    const testFunction = TEST_FUNCTION.exec(line);
    if (declared !== null) {
      const indent = capture(declared, 1).length;
      enclosing.push({
        indent,
        name: capture(declared, 2),
        bases: declared[3] ?? '',
        decorators: decoratorsAbove(view.masked, index, indent),
      });
    } else if (testFunction !== null) {
      tests.push(buildTest({ declared: testFunction, view, index, enclosing }));
    }
  }
  return uniqueKeys(tests).map((test) => ({ ...test, skipped: test.skipped || moduleSkipped }));
}
