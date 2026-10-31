import { maskSource } from '../../masking/mask.mjs';
import { uniqueKeys } from '../../occurrences.mjs';
import { measureBody } from '../assertions.mjs';
import { parametrizeRows } from './rows.mjs';

const CLASS = /^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?/u;
const TEST_FUNCTION = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/u;
const SKIP_DECORATOR =
  /@\s*(?:[\w.]*\.)?(?:skip|skipif|skipIf|skipUnless|xfail|expectedFailure)\b|\bmarks\s*=\s*[\w.]*\b(?:skip|xfail)\b/u;
const MODULE_SKIP =
  /^pytestmark\s*=.*\b(?:skip|skipif|xfail)\b|^(?:\w+\s*=\s*)?pytest\.importorskip\s*\(|^pytest\.skip\s*\(.*allow_module_level/mu;
const TEST_CASE = /\bTestCase\b/u;

const indentOf = (line) => line.length - line.trimStart().length;
const isBlank = (line) => line.trim() === '';

// The decorator lines above a `def` or `class` line, including those of a multi-line argument list.
function decoratorsAbove(lines, index, indent) {
  let start = index;
  while (start > 0) {
    const previous = lines[start - 1].trim();
    const continues = indentOf(lines[start - 1]) > indent || /^[@)\]}]/u.test(previous);
    if (previous === '' || !continues) break;
    start -= 1;
  }
  return lines.slice(start, index);
}

const bracketBalance = (line) =>
  [...line].reduce(
    (depth, character) =>
      depth + Number('([{'.includes(character)) - Number(')]}'.includes(character)),
    0,
  );

// The line where the signature that starts at `index` ends, after its bracketed parameter list.
function signatureEnd(lines, index) {
  let depth = bracketBalance(lines[index]);
  let at = index;
  while (depth > 0 && at + 1 < lines.length) {
    at += 1;
    depth += bracketBalance(lines[at]);
  }
  return at;
}

// The lines after a `def` that are indented deeper than it, blank lines inside included.
function bodyEnd(lines, index, indent) {
  const signature = signatureEnd(lines, index);
  let end = signature + 1;
  let last = signature;
  while (end < lines.length) {
    if (!isBlank(lines[end])) {
      if (indentOf(lines[end]) <= indent) break;
      last = end;
    }
    end += 1;
  }
  return last + 1;
}

const shapeOf = (lines) =>
  lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');

const isCollectedClass = ({ name, bases }) => name.startsWith('Test') || TEST_CASE.test(bases);

function buildTest({ language, view, index, enclosing }) {
  const [, indentText, name] = TEST_FUNCTION.exec(view.masked[index]);
  const indent = indentText.length;
  const end = bodyEnd(view.masked, index, indent);
  const decorators = decoratorsAbove(view.masked, index, indent);
  const measured = measureBody(language, {
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

/**
 * The tests of a pytest or unittest module: every `def test*`, its enclosing classes giving the
 * key (`TestCart.test_total`). Each is `{ key, line, shape, source, assertions, tautologies, weak,
 * skipped, rows, collected }`; `source` is the test with its decorators, comments blanked, `rows`
 * the cases its `parametrize` lists give (undefined when unknown) and `collected` whether its
 * classes are ones pytest collects (`Test*`, or a `TestCase`).
 */
export function parsePythonTests(text) {
  const view = {
    masked: maskSource('python', text).masked.split('\n'),
    kept: maskSource('python', text, { keepStrings: true }).masked.split('\n'),
  };
  const moduleSkipped = MODULE_SKIP.test(view.masked.join('\n'));
  const enclosing = [];
  const tests = [];
  view.masked.forEach((line, index) => {
    if (isBlank(line)) return;
    while (enclosing.length > 0 && enclosing.at(-1).indent >= indentOf(line)) enclosing.pop();
    const declared = CLASS.exec(line);
    if (declared !== null) {
      const indent = declared[1].length;
      enclosing.push({
        indent,
        name: declared[2],
        bases: declared[3] ?? '',
        decorators: decoratorsAbove(view.masked, index, indent),
      });
    } else if (TEST_FUNCTION.test(line)) {
      tests.push(buildTest({ language: 'python', view, index, enclosing }));
    }
  });
  return uniqueKeys(tests).map((test) => ({ ...test, skipped: test.skipped || moduleSkipped }));
}
