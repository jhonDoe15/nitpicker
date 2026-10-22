import path from 'node:path';
import {
  boundValues,
  formatTitle,
  literalOf,
  literalsIn,
  rowsOf,
  tableOf,
} from './test-tables.mjs';
import { lineOf, parseSource, ts } from './typescript.mjs';

const SUITE_NAMES = new Map([
  ['describe', {}],
  ['suite', {}],
  ['xdescribe', { skipped: true }],
  ['fdescribe', { only: true }],
]);
const TEST_NAMES = new Map([
  ['it', {}],
  ['test', {}],
  ['xit', { skipped: true }],
  ['xtest', { skipped: true }],
  ['fit', { only: true }],
]);
const SKIP_MODIFIERS = new Set(['skip', 'todo', 'skipIf']);
const EXPECT_FACTORIES = new Set(['soft', 'poll', 'element']);
const MOCK_OWNERS = new Set(['vi', 'jest']);
const MOCK_METHODS = new Set(['mock', 'doMock']);

/**
 * Parses a test file into its tests and mock calls.
 *
 * Each test is `{ key, title, line, skipped, only, assertions, weak, tautologies, shape }`:
 * `key` is the describe titles joined with the test title (duplicates get a `#n` suffix), with one
 * entry per row of an `it.each` table (`row: true`, the title formatted from the row's values),
 * `assertions` counts `expect(...).matcher()` and `assert...()` calls, `weak` lists matchers that
 * pass for almost any value, `tautologies` lists assertions that cannot fail, and `shape` is the
 * whitespace-normalized callback text used to recognise a renamed test (plus the row's text for a
 * row), and `literals` the sorted literal values the body and the row's bound values hold.
 */
export function parseTestFile(file, text) {
  const sourceFile = parseSource(file, text);
  const tests = [];
  const keyCounts = new Map();

  const visit = (node, suite) => {
    if (ts.isCallExpression(node)) {
      const callee = describeCallee(node.expression);
      if (callee !== undefined && callee.kind === 'suite') {
        const title = titleOf(node, sourceFile);
        const inner = {
          titles: [...suite.titles, title],
          skipped: suite.skipped || callee.skipped,
          only: suite.only || callee.only,
        };
        for (const argument of node.arguments.slice(1)) {
          ts.forEachChild(argument, (child) => {
            visit(child, inner);
          });
        }
        return;
      }
      if (callee !== undefined && callee.kind === 'test') {
        tests.push(...analyzeTest({ node, callee, suite, sourceFile, keyCounts }));
        return;
      }
    }
    ts.forEachChild(node, (child) => {
      visit(child, suite);
    });
  };
  visit(sourceFile, { titles: [], skipped: false, only: false });

  return { tests, ...mocksOf(file, sourceFile) };
}

function describeCallee(expression) {
  const modifiers = [];
  let node = expression;
  for (;;) {
    if (ts.isCallExpression(node)) {
      node = node.expression;
    } else if (ts.isTaggedTemplateExpression(node)) {
      node = node.tag;
    } else if (ts.isPropertyAccessExpression(node)) {
      modifiers.push(node.name.text);
      node = node.expression;
    } else {
      break;
    }
  }
  if (!ts.isIdentifier(node)) {
    return undefined;
  }
  const suite = SUITE_NAMES.get(node.text);
  const test = TEST_NAMES.get(node.text);
  const base = suite ?? test;
  if (base === undefined) {
    return undefined;
  }
  return {
    kind: suite === undefined ? 'test' : 'suite',
    skipped: base.skipped === true || modifiers.some((name) => SKIP_MODIFIERS.has(name)),
    only: base.only === true || modifiers.includes('only'),
  };
}

function titleOf(call, sourceFile) {
  const [first] = call.arguments;
  if (first !== undefined && ts.isStringLiteralLike(first)) {
    return first.text;
  }
  return `<dynamic title at line ${String(lineOf(sourceFile, call))}>`;
}

function keyFor(titles, keyCounts) {
  const baseKey = titles.join(' > ');
  const seen = keyCounts.get(baseKey) ?? 0;
  keyCounts.set(baseKey, seen + 1);
  return seen === 0 ? baseKey : `${baseKey}#${String(seen + 1)}`;
}

function analyzeTest({ node, callee, suite, sourceFile, keyCounts }) {
  const title = titleOf(node, sourceFile);
  const body = node.arguments.find(
    (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
  );
  const table = tableOf(node);
  const rows = table === undefined ? undefined : rowsOf(table, sourceFile);
  if (rows === undefined) {
    const result = analyzeBody({ node, callee, suite, sourceFile, body });
    return [{ ...result, key: keyFor([...suite.titles, title], keyCounts), title }];
  }
  return rows.map((row, index) => {
    const result = analyzeBody({ node, callee, suite, sourceFile, body });
    const rowTitle = formatTitle(title, row, index);
    const bound = body === undefined ? [] : boundValues(row, body);
    return {
      ...result,
      key: keyFor([...suite.titles, rowTitle], keyCounts),
      title: rowTitle,
      line: row.line,
      row: true,
      shape: `${result.shape} @ ${row.text}`,
      weak: [...result.weak, ...rowWeakness(bound, body, sourceFile)],
      literals: [
        ...result.literals,
        ...bound.map(({ node: value }) => literalOf(value) ?? `?${value.getText(sourceFile)}`),
      ].toSorted(),
    };
  });
}

function rowWeakness(bound, body, sourceFile) {
  const weak = [];
  for (const { node, name } of bound) {
    if (name === undefined || !isAnything(node, sourceFile)) {
      continue;
    }
    const visit = (child) => {
      const assertion = ts.isCallExpression(child) ? assertionOf(child) : undefined;
      const [first] = assertion?.args ?? [];
      if (
        assertion !== undefined &&
        !assertion.negated &&
        first !== undefined &&
        ts.isIdentifier(first) &&
        first.text === name
      ) {
        weak.push(`${assertion.matcher}(expect.anything())`);
      }
      ts.forEachChild(child, visit);
    };
    visit(body);
  }
  return weak;
}

function isAnything(node, sourceFile) {
  return ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'expect.anything';
}

function analyzeBody({ node, callee, suite, sourceFile, body }) {
  const result = {
    line: lineOf(sourceFile, node),
    skipped: suite.skipped || callee.skipped,
    only: suite.only || callee.only,
    assertions: 0,
    weak: [],
    tautologies: [],
    shape: '',
    literals: [],
  };
  if (body === undefined) {
    return result;
  }
  result.shape = body.getText(sourceFile).replace(/\s+/g, ' ');
  result.literals = literalsIn(body.body).toSorted();
  const visit = (child) => {
    if (ts.isCallExpression(child)) {
      if (isInBodySkip(child)) {
        result.skipped = true;
      }
      const assertion = assertionOf(child);
      if (assertion !== undefined) {
        result.assertions += 1;
        const weak = weakMatcher(assertion);
        if (weak !== undefined) {
          result.weak.push(weak);
        }
        if (isTautology(assertion, sourceFile)) {
          result.tautologies.push(child.getText(sourceFile).replace(/\s+/g, ' '));
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(body);
  return result;
}

// `ctx.skip()` / `context.skip()` inside a test body skips the test at runtime.
function isInBodySkip(call) {
  return (
    call.arguments.length <= 1 &&
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === 'skip' &&
    ts.isIdentifier(call.expression.expression) &&
    ['ctx', 'context', 't'].includes(call.expression.expression.text)
  );
}

function isExpectCall(call) {
  if (!ts.isCallExpression(call)) {
    return false;
  }
  const callee = call.expression;
  return (
    (ts.isIdentifier(callee) && callee.text === 'expect') ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === 'expect' &&
      EXPECT_FACTORIES.has(callee.name.text))
  );
}

/** `{ kind: 'expect' | 'assert', subject?, matcher, negated, args }` or undefined. */
export function assertionOf(call) {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return ts.isIdentifier(call.expression) && call.expression.text === 'assert'
      ? { kind: 'assert', matcher: 'ok', negated: false, args: call.arguments }
      : undefined;
  }
  const names = [];
  let current = call.expression;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current) && current.text === 'assert') {
    return { kind: 'assert', matcher: names.at(-1), negated: false, args: call.arguments };
  }
  if (isExpectCall(current)) {
    return {
      kind: 'expect',
      subject: current.arguments[0],
      matcher: names.at(-1),
      negated: names.includes('not'),
      args: call.arguments,
    };
  }
  return undefined;
}

function weakMatcher(assertion) {
  if (assertion.kind !== 'expect') {
    return undefined;
  }
  const { matcher, negated, args } = assertion;
  const [first] = args;
  if (!negated && ['toBeDefined', 'toBeTruthy', 'toBeFalsy'].includes(matcher)) {
    return matcher;
  }
  if (negated && ['toBeUndefined', 'toBeNull', 'toBeFalsy'].includes(matcher)) {
    return `not.${matcher}`;
  }
  if (
    matcher === 'toMatchObject' &&
    first !== undefined &&
    ts.isObjectLiteralExpression(first) &&
    first.properties.length === 0
  ) {
    return 'toMatchObject({})';
  }
  if (
    ['toBe', 'toEqual', 'toStrictEqual'].includes(matcher) &&
    first !== undefined &&
    ts.isCallExpression(first) &&
    first.expression.getText() === 'expect.anything'
  ) {
    return `${matcher}(expect.anything())`;
  }
  if (
    matcher === 'toBeInstanceOf' &&
    first !== undefined &&
    ts.isIdentifier(first) &&
    first.text === 'Object'
  ) {
    return 'toBeInstanceOf(Object)';
  }
  if (matcher === 'toBeGreaterThanOrEqual' && first !== undefined && first.getText() === '0') {
    return 'toBeGreaterThanOrEqual(0)';
  }
  return undefined;
}

const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual', 'equal', 'strictEqual']);

function isTautology(assertion, sourceFile) {
  const { kind, matcher, negated, args } = assertion;
  if (negated) {
    return false;
  }
  const subject = kind === 'expect' ? assertion.subject : args[0];
  const other = kind === 'expect' ? args[0] : args[1];
  if (subject === undefined) {
    return false;
  }
  if (EQUALITY_MATCHERS.has(matcher) && other !== undefined) {
    return (
      isPlainValue(subject) &&
      isPlainValue(other) &&
      subject.getText(sourceFile) === other.getText(sourceFile)
    );
  }
  const literal = literalTruthiness(subject);
  if (literal === undefined) {
    return false;
  }
  if (['toBeTruthy', 'ok'].includes(matcher)) {
    return literal;
  }
  if (matcher === 'toBeFalsy') {
    return !literal;
  }
  return false;
}

function isPlainValue(node) {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    ts.isIdentifier(node) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
      node.kind,
    )
  );
}

// The truthiness of a literal, or undefined when the node is not a literal.
function literalTruthiness(node) {
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
    return false;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text) !== 0;
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text.length > 0;
  }
  return undefined;
}

function mocksOf(file, sourceFile) {
  const imports = [];
  const mocks = [];
  const spies = [];
  const namespaces = new Map();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier.startsWith('.')) {
        imports.push(resolveSpecifier(file, specifier));
        const bindings = node.importClause?.namedBindings;
        if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
          namespaces.set(bindings.name.text, resolveSpecifier(file, specifier));
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const { expression, name } = node.expression;
      if (ts.isIdentifier(expression) && MOCK_OWNERS.has(expression.text)) {
        const [first, second] = node.arguments;
        if (MOCK_METHODS.has(name.text) && first !== undefined && ts.isStringLiteralLike(first)) {
          mocks.push({
            target: resolveSpecifier(file, first.text),
            line: lineOf(sourceFile, node),
          });
        }
        if (name.text === 'spyOn' && first !== undefined && ts.isIdentifier(first)) {
          spies.push({
            namespace: first.text,
            member: second !== undefined && ts.isStringLiteralLike(second) ? second.text : '*',
            line: lineOf(sourceFile, node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { imports, mocks, spies, namespaces };
}

export function resolveSpecifier(fromFile, specifier) {
  return normalizeModule(path.posix.join(path.posix.dirname(fromFile), specifier));
}

/** Drops the extension and a trailing `/index`, so `./a`, `./a.js` and `./a/index.ts` agree. */
export function normalizeModule(modulePath) {
  return modulePath.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '');
}

/** The modules a test file exercises, by naming convention: `a.test.ts` tests `a`. */
export function subjectCandidates(testFile, imports) {
  const stem = path.posix.basename(testFile).replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '');
  const directory = path.posix.dirname(testFile);
  const parent = directory.endsWith('__tests__') ? path.posix.dirname(directory) : directory;
  const candidates = new Set([
    normalizeModule(path.posix.join(directory, stem)),
    normalizeModule(path.posix.join(parent, stem)),
  ]);
  for (const target of imports) {
    if (path.posix.basename(target) === stem) {
      candidates.add(target);
    }
  }
  return candidates;
}
