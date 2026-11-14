import type TypeScript from 'typescript';
import { typescriptApi } from '../typed/typescript-program.mts';
import { escapeRegExp } from '../typed/tooling.mts';

type Node = TypeScript.Node;

type CallEntry = {
  readonly key: string;
  readonly dynamic: boolean;
  readonly fileLevel: boolean;
  readonly text: string;
  readonly line: number;
};

export type TestCall = CallEntry & { readonly matcher: RegExp };

type Described = {
  readonly kind: 'test' | 'suite';
  readonly table: boolean;
  readonly title: string;
};

type Scope = { readonly titles: readonly string[]; readonly tabled: boolean };

type CollectContext = { readonly sourceFile: TypeScript.SourceFile; readonly entries: CallEntry[] };

const ts = typescriptApi();

const TEST_FUNCTIONS = new Set(['it', 'test', 'specify', 'fit', 'xit', 'ftest', 'xtest']);
const SUITE_FUNCTIONS = new Set(['describe', 'suite', 'context', 'fdescribe', 'xdescribe']);
const TABLE_METHODS = new Set(['each', 'for']);
const FORMAT_TOKEN = /%[sdifjoOpc#%]|\$[\w#.]+/gu;
const ANY = '.*';

function innerExpression(node: Node): Node | undefined {
  if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    return node.expression;
  }
  return ts.isTaggedTemplateExpression(node) ? node.tag : undefined;
}

function calleeNames(expression: Node): string[] | undefined {
  const chain = [expression];
  for (const node of chain) {
    const next = innerExpression(node);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  if (root === undefined || !ts.isIdentifier(root)) {
    return undefined;
  }
  const names = chain.filter((node) => ts.isPropertyAccessExpression(node));
  return [root.text, ...names.map((node) => node.name.text).toReversed()];
}

function isEachTable(call: TypeScript.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(call.expression) && TABLE_METHODS.has(call.expression.name.text)
  );
}

function literalPattern(text: string, each: boolean): string {
  return each ? text.split(FORMAT_TOKEN).map(escapeRegExp).join(ANY) : escapeRegExp(text);
}

function operands(node: Node): Node[] {
  if (ts.isParenthesizedExpression(node)) {
    return [node.expression];
  }
  return isPlus(node) ? [node.left, node.right] : [];
}

function titleLeaves(node: Node): Node[] {
  const pending = [node];
  for (const current of pending) {
    pending.push(...operands(current));
  }
  return pending.filter((leaf) => operands(leaf).length === 0).sort((a, b) => a.pos - b.pos);
}

function isPlus(node: Node): node is TypeScript.BinaryExpression {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function leafPattern(node: Node, each: boolean): string {
  if (ts.isStringLiteralLike(node)) {
    return literalPattern(node.text, each);
  }
  if (ts.isTemplateExpression(node)) {
    return [
      literalPattern(node.head.text, each),
      ...node.templateSpans.map((span) => `${ANY}${literalPattern(span.literal.text, each)}`),
    ].join('');
  }
  return ANY;
}

function titlePattern(node: Node | undefined, each: boolean): string {
  if (node === undefined) {
    return ANY;
  }
  return titleLeaves(node)
    .map((leaf) => leafPattern(leaf, each))
    .join('');
}

function kindOf(root: string | undefined): Described['kind'] | undefined {
  if (root === undefined) {
    return undefined;
  }
  if (TEST_FUNCTIONS.has(root)) {
    return 'test';
  }
  return SUITE_FUNCTIONS.has(root) ? 'suite' : undefined;
}

function describeCall(call: TypeScript.CallExpression): Described | undefined {
  const names = calleeNames(call.expression);
  const kind = kindOf(names?.[0]);
  if (names === undefined || kind === undefined || isEachTable(call)) {
    return undefined;
  }
  const table = names.some((name) => TABLE_METHODS.has(name));
  return { kind, table, title: titlePattern(call.arguments[0], table) };
}

function lineOf(sourceFile: TypeScript.SourceFile, node: Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

const PRINTER = ts.createPrinter();

function printed(node: Node, sourceFile: TypeScript.SourceFile): string {
  return PRINTER.printNode(ts.EmitHint.Unspecified, node, sourceFile).replaceAll(/\s+/gu, ' ');
}

function collect(node: Node, context: CollectContext, scope: Scope): void {
  const described = ts.isCallExpression(node) ? describeCall(node) : undefined;
  if (described?.kind === 'test') {
    const dynamic = described.title === ANY;
    context.entries.push({
      key: [...scope.titles, described.title].join(' '),
      dynamic,
      fileLevel: dynamic || described.table || scope.tabled,
      text: printed(node, context.sourceFile),
      line: lineOf(context.sourceFile, node),
    });
    return;
  }
  const inner =
    described === undefined
      ? scope
      : { titles: [...scope.titles, described.title], tabled: scope.tabled || described.table };
  ts.forEachChild(node, (child) => {
    collect(child, context, inner);
  });
}

export function testCallsOf(file: string, text: string): TestCall[] {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const context: CollectContext = { sourceFile, entries: [] };
  collect(sourceFile, context, { titles: [], tabled: false });
  return context.entries.map((entry) => ({
    ...entry,
    matcher: new RegExp(`^${new RegExp(entry.key, 'su').source}$`, 'su'),
  }));
}
