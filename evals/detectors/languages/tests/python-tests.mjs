import { maskSource } from '../masking/mask.mjs';
import { measureBody } from './patterns.mjs';

const CLASS = /^(\s*)class\s+(\w+)/u;
const TEST_FUNCTION = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/u;
const SKIP_DECORATOR =
  /@\s*(?:pytest\.mark\.(?:skip|skipif|xfail)|unittest\.(?:skip|skipIf|skipUnless|expectedFailure)|skip\w*|expectedFailure)\b/u;
const MODULE_SKIP = /^pytestmark\s*=.*\b(?:skip|skipif|xfail)\b/mu;

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

// The lines after a `def` that are indented deeper than it, blank lines inside included.
function bodyEnd(lines, index, indent) {
  let end = index + 1;
  let last = index;
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
    key: [...enclosing.map((entry) => entry.name), name].join('.'),
    line: index + 1,
    shape: shapeOf(view.kept.slice(index + 1, end)),
    source: view.kept.slice(index - decorators.length, end).join('\n'),
    ...measured,
    skipped: measured.skipped || decorated.some((line) => SKIP_DECORATOR.test(line)),
  };
}

function uniqueKeys(tests) {
  const seen = new Map();
  return tests.map((test) => {
    const count = seen.get(test.key) ?? 0;
    seen.set(test.key, count + 1);
    return count === 0 ? test : { ...test, key: `${test.key}#${String(count + 1)}` };
  });
}

/**
 * The tests of a pytest or unittest module: every `def test*`, its enclosing classes giving the
 * key (`TestCart.test_total`). Each is `{ key, line, shape, source, assertions, tautologies, weak,
 * skipped }`; `source` is the test with its decorators, comments blanked.
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
        decorators: decoratorsAbove(view.masked, index, indent),
      });
    } else if (TEST_FUNCTION.test(line)) {
      tests.push(buildTest({ language: 'python', view, index, enclosing }));
    }
  });
  return uniqueKeys(tests).map((test) => ({ ...test, skipped: test.skipped || moduleSkipped }));
}
