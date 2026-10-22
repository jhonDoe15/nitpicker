import path from 'node:path';
import { maskSource } from '../masking/mask.mjs';

const PATCH_BY_NAME =
  /\b(?:monkeypatch\.setattr|(?:mock\.|mocker\.|unittest\.mock\.)?patch)\s*\(\s*(['"])([\w.]+)\1/gu;
const PATCH_OBJECT =
  /\b(?:monkeypatch\.setattr|patch\.object)\s*\(\s*([\w.]+)\s*,\s*(['"])(\w+)\2/gu;
const TEST_NAME = /^(?:test_)?(.*?)(?:_test)?$/u;
const SUFFIX = /(?:Tests?|IT|Spec)$/u;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const camelCase = (name) =>
  name.replaceAll(/(?:^|_)(\w)/gu, (_match, letter) => letter.toUpperCase());

// What a test module defines at its top level, found in the module the tests are named after.
function definitionsOf({ stem, tree }) {
  const subject = [...tree.keys()].find(
    (file) =>
      !/(?:^|\/)(?:test_|tests?\/)/u.test(file) &&
      (file === `${stem}.py` ||
        file.endsWith(`/${stem}.py`) ||
        file.endsWith(`/${stem}/__init__.py`)),
  );
  const names = new Set();
  const classes = new Set();
  for (const match of (tree.get(subject) ?? '').matchAll(
    /^(?:async\s+)?(def|class)\s+(\w+)|^(\w+)\s*[:=]/gmu,
  )) {
    names.add(match[2] ?? match[3]);
    if (match[1] === 'class') classes.add(match[2]);
  }
  return { found: subject !== undefined, names, classes };
}

function pythonMocks({ file, kept, tree }) {
  const stem = TEST_NAME.exec(path.posix.basename(file, '.py'))[1];
  const subjects = new Set([stem, camelCase(stem)]);
  const defined = definitionsOf({ stem, tree });
  if (!defined.found) return [];
  const named = [...kept.matchAll(PATCH_BY_NAME)].map((match) => {
    const segments = match[2].split('.');
    const rest = segments.slice(segments.lastIndexOf(stem) + 1);
    const inside =
      segments.includes(stem) &&
      (rest.length === 0 || (rest.length === 1 && defined.names.has(rest[0])));
    const ownClass =
      segments.includes(stem) && subjects.has(rest[0]) && defined.classes.has(rest[0]);
    return { target: match[2], line: lineOf(kept, match.index), mocked: inside || ownClass };
  });
  const objects = [...kept.matchAll(PATCH_OBJECT)].map((match) => {
    const owner = match[1].split('.').at(-1);
    const mocked =
      (owner === stem && defined.names.has(match[3])) ||
      (subjects.has(owner) && defined.classes.has(owner));
    return { target: `${match[1]}.${match[3]}`, line: lineOf(kept, match.index), mocked };
  });
  return [...named, ...objects].filter((mock) => mock.mocked);
}

function jvmMocks({ file, kept }) {
  const subject = path.posix
    .basename(file)
    .replace(/\.\w+$/u, '')
    .replace(SUFFIX, '');
  if (subject === '') return [];
  const pattern = new RegExp(
    String.raw`\b(?:mock|spy|mockStatic|mockkStatic|mockkObject|mockk|spyk)\s*[<(]\s*${subject}\b|@(?:Mock|Spy|MockK|SpyK|MockBean|SpyBean)\b[^;=\n]*\b${subject}\b`,
    'gu',
  );
  return [...kept.matchAll(pattern)].map((match) => ({
    target: match[0].replaceAll(/\s+/gu, ' '),
    line: lineOf(kept, match.index),
  }));
}

/**
 * The mocks in a test file of the module or class the file is named after, as `{ target, line }`.
 * Python: a `patch`, `patch.object` or `monkeypatch.setattr` of the module `test_cart.py` is named
 * after (`cart`) or of a function or class that module defines (`demo.cart.total`), or of its class
 * (`Cart`); patching what the module imported (`demo.cart.requests.get`) is the usual way to fake
 * a collaborator and is not reported. Java and Kotlin: `mock(Cart.class)`, `spy(...)`, `@Mock Cart`,
 * `mockk<Cart>()` and the like in `CartTest`. `tree` is the final tree, for the module's definitions.
 */
export function mockedSubjects({ language, file, text, tree }) {
  const kept = maskSource(language, text, { keepStrings: true }).masked;
  return language === 'python' ? pythonMocks({ file, kept, tree }) : jvmMocks({ file, kept });
}
