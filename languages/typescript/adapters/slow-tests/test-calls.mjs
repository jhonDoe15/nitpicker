import ts from 'typescript';
import { escapeRegExp } from '../../../../shared/glob.mjs';

const TEST_FUNCTIONS = new Set(['it', 'test', 'specify']);
const SUITE_FUNCTIONS = new Set(['describe', 'suite', 'context']);
const EACH = 'each';
const FORMAT_TOKEN = /%[sdifjoOpc#%]|\$[\w#.]+/gu;
const ANY = '.*';

function calleeNames(expression) {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const base = calleeNames(expression.expression);
    return base === undefined ? undefined : [...base, expression.name.text];
  }
  if (ts.isCallExpression(expression)) {
    return calleeNames(expression.expression);
  }
  return ts.isTaggedTemplateExpression(expression) ? calleeNames(expression.tag) : undefined;
}

function isEachTable(call) {
  return ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === EACH;
}

function literalPattern(text, each) {
  return each ? text.split(FORMAT_TOKEN).map(escapeRegExp).join(ANY) : escapeRegExp(text);
}

function titlePattern(node, each) {
  if (node === undefined) {
    return ANY;
  }
  if (ts.isStringLiteralLike(node)) {
    return literalPattern(node.text, each);
  }
  if (ts.isTemplateExpression(node)) {
    return [
      literalPattern(node.head.text, each),
      ...node.templateSpans.map((span) => `${ANY}${literalPattern(span.literal.text, each)}`),
    ].join('');
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${titlePattern(node.left, each)}${titlePattern(node.right, each)}`;
  }
  return ts.isParenthesizedExpression(node) ? titlePattern(node.expression, each) : ANY;
}

function describeCall(call) {
  const names = calleeNames(call.expression);
  const root = names?.[0];
  const kind = TEST_FUNCTIONS.has(root) ? 'test' : SUITE_FUNCTIONS.has(root) ? 'suite' : undefined;
  if (kind === undefined || isEachTable(call)) {
    return undefined;
  }
  return { kind, title: titlePattern(call.arguments[0], names.includes(EACH)) };
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function normalized(text) {
  return text.replaceAll(/\s+/gu, ' ');
}

function collect(node, context, titles) {
  const described = ts.isCallExpression(node) ? describeCall(node) : undefined;
  if (described?.kind === 'test') {
    context.entries.push({
      key: [...titles, described.title].join(' '),
      dynamic: described.title === ANY,
      text: normalized(node.getText(context.sourceFile)),
      line: lineOf(context.sourceFile, node),
    });
    return;
  }
  const inner = described === undefined ? titles : [...titles, described.title];
  ts.forEachChild(node, (child) => {
    collect(child, context, inner);
  });
}

export function testCallsOf(file, text) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const context = { sourceFile, entries: [] };
  collect(sourceFile, context, []);
  return context.entries.map((entry) => ({
    ...entry,
    matcher: new RegExp(`^${entry.key}$`, 'su'),
  }));
}
