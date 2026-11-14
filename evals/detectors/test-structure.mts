import type typescript from 'typescript';
import {
  assertionOf,
  isInBodySkip,
  isTautology,
  weakMatcher,
} from './assertions/expect-assertions.mts';
import {
  type Bound,
  boundValues,
  formatTitle,
  literalOf,
  literalsIn,
  rowsOf,
  tableOf,
} from './test-tables.mts';
import { mocksOf, type ModuleMocks } from './modules/module-references.mts';
import { lineOf, type Node, parseSource, type SourceFile, ts } from './typescript.mts';

type Modifiers = { skipped?: boolean; only?: boolean };

type Callee = { kind: 'suite' | 'test'; skipped: boolean; only: boolean };

type Suite = { titles: string[]; skipped: boolean; only: boolean };

type Callback = typescript.ArrowFunction | typescript.FunctionExpression;

type Analysis = {
  line: number;
  skipped: boolean;
  only: boolean;
  assertions: number;
  weak: string[];
  tautologies: string[];
  shape: string;
  literals: string[];
};

export type TestInfo = Analysis & { key: string; title: string; row?: true };

export type ParsedTestFile = ModuleMocks & { tests: TestInfo[] };

type AnalyzeInput = {
  node: typescript.CallExpression;
  callee: Callee;
  suite: Suite;
  sourceFile: SourceFile;
  body: Callback | undefined;
};

const SUITE_NAMES = new Map<string, Modifiers>([
  ['describe', {}],
  ['suite', {}],
  ['xdescribe', { skipped: true }],
  ['fdescribe', { only: true }],
]);
const TEST_NAMES = new Map<string, Modifiers>([
  ['it', {}],
  ['test', {}],
  ['xit', { skipped: true }],
  ['xtest', { skipped: true }],
  ['fit', { only: true }],
]);
const SKIP_MODIFIERS = new Set(['skip', 'todo', 'skipIf']);

function isCallback(node: Node): node is Callback {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function peel(node: Node, modifiers: string[]): Node | undefined {
  if (ts.isCallExpression(node)) {
    return node.expression;
  }
  if (ts.isTaggedTemplateExpression(node)) {
    return node.tag;
  }
  if (ts.isPropertyAccessExpression(node)) {
    modifiers.push(node.name.text);
    return node.expression;
  }
  return undefined;
}

function describeCallee(expression: Node): Callee | undefined {
  const modifiers: string[] = [];
  let node = expression;
  for (let next = peel(node, modifiers); next !== undefined; next = peel(node, modifiers)) {
    node = next;
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

function titleOf(call: typescript.CallExpression, sourceFile: SourceFile): string {
  const [first] = call.arguments;
  if (first !== undefined && ts.isStringLiteralLike(first)) {
    return first.text;
  }
  return `<dynamic title at line ${String(lineOf(sourceFile, call))}>`;
}

function keyFor(titles: readonly string[], keyCounts: Map<string, number>): string {
  const baseKey = titles.join(' > ');
  const seen = keyCounts.get(baseKey) ?? 0;
  keyCounts.set(baseKey, seen + 1);
  return seen === 0 ? baseKey : `${baseKey}#${String(seen + 1)}`;
}

function isAnything(node: Node, sourceFile: SourceFile): boolean {
  return ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'expect.anything';
}

function rowWeakness(
  bound: readonly Bound[],
  body: Callback | undefined,
  sourceFile: SourceFile,
): string[] {
  const weak: string[] = [];
  if (body === undefined) {
    return weak;
  }
  for (const { node, name } of bound) {
    if (name === undefined || !isAnything(node, sourceFile)) {
      continue;
    }
    function visit(child: Node) {
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
    }
    visit(body);
  }
  return weak;
}

function analyzeBody({ node, callee, suite, sourceFile, body }: AnalyzeInput): Analysis {
  const result: Analysis = {
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
  function visit(child: Node) {
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
  }
  visit(body);
  return result;
}

function analyzeTest({
  keyCounts,
  ...input
}: Omit<AnalyzeInput, 'body'> & { keyCounts: Map<string, number> }): TestInfo[] {
  const { node, sourceFile, suite } = input;
  const title = titleOf(node, sourceFile);
  const body = node.arguments.find(isCallback);
  const table = tableOf(node);
  const rows = table === undefined ? undefined : rowsOf(table, sourceFile);
  if (rows === undefined) {
    const result = analyzeBody({ ...input, body });
    return [{ ...result, key: keyFor([...suite.titles, title], keyCounts), title }];
  }
  return rows.map((row, index) => {
    const result = analyzeBody({ ...input, body });
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

export function parseTestFile(file: string, text: string): ParsedTestFile {
  const sourceFile = parseSource(file, text);
  const tests: TestInfo[] = [];
  const keyCounts = new Map<string, number>();

  function visit(node: Node, suite: Suite): void {
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
  }
  visit(sourceFile, { titles: [], skipped: false, only: false });

  return { tests, ...mocksOf(file, sourceFile) };
}
