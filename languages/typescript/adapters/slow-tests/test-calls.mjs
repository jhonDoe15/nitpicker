import ts from 'typescript';
import { escapeRegExp } from '../../../../shared/glob.mjs';

const TEST_FUNCTIONS = new Set(['it', 'test', 'specify', 'fit', 'xit', 'ftest', 'xtest']);
const SUITE_FUNCTIONS = new Set(['describe', 'suite', 'context', 'fdescribe', 'xdescribe']);
const TABLE_METHODS = new Set(['each', 'for']);
const FORMAT_TOKEN = /%[sdifjoOpc#%]|\$[\w#.]+/gu;
const ANY = '.*';

function innerExpression(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    return node.expression;
  }
  return ts.isTaggedTemplateExpression(node) ? node.tag : undefined;
}

function calleeNames(expression) {
  const chain = [expression];
  for (const node of chain) {
    const next = innerExpression(node);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  if (!ts.isIdentifier(root)) {
    return undefined;
  }
  const names = chain.filter((node) => ts.isPropertyAccessExpression(node));
  return [root.text, ...names.map((node) => node.name.text).reverse()];
}

function isEachTable(call) {
  return (
    ts.isPropertyAccessExpression(call.expression) && TABLE_METHODS.has(call.expression.name.text)
  );
}

function literalPattern(text, each) {
  return each ? text.split(FORMAT_TOKEN).map(escapeRegExp).join(ANY) : escapeRegExp(text);
}

function operands(node) {
  if (ts.isParenthesizedExpression(node)) {
    return [node.expression];
  }
  return isPlus(node) ? [node.left, node.right] : [];
}

function titleLeaves(node) {
  const pending = [node];
  for (const current of pending) {
    pending.push(...operands(current));
  }
  return pending.filter((leaf) => operands(leaf).length === 0).sort((a, b) => a.pos - b.pos);
}

function isPlus(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function leafPattern(node, each) {
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

function titlePattern(node, each) {
  if (node === undefined) {
    return ANY;
  }
  return titleLeaves(node)
    .map((leaf) => leafPattern(leaf, each))
    .join('');
}

function kindOf(root) {
  if (TEST_FUNCTIONS.has(root)) {
    return 'test';
  }
  return SUITE_FUNCTIONS.has(root) ? 'suite' : undefined;
}

function describeCall(call) {
  const names = calleeNames(call.expression);
  const kind = kindOf(names?.[0]);
  if (kind === undefined || isEachTable(call)) {
    return undefined;
  }
  const table = names.some((name) => TABLE_METHODS.has(name));
  return { kind, table, title: titlePattern(call.arguments[0], table) };
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

const PRINTER = ts.createPrinter();

function printed(node, sourceFile) {
  return PRINTER.printNode(ts.EmitHint.Unspecified, node, sourceFile).replaceAll(/\s+/gu, ' ');
}

function collect(node, context, scope) {
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

export function testCallsOf(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const context = { sourceFile, entries: [] };
  collect(sourceFile, context, { titles: [], tabled: false });
  return context.entries.map((entry) => ({
    ...entry,
    matcher: new RegExp(`^${entry.key}$`, 'su'),
  }));
}
