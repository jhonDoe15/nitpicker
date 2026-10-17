import ts from 'typescript';
import { escapeRegExp } from '../../../../shared/glob.mjs';

const TEST_FUNCTIONS = new Set(['it', 'test', 'specify']);
const SUITE_FUNCTIONS = new Set(['describe', 'suite', 'context']);
const EACH = 'each';
const FORMAT_TOKEN = /%[sdifjoOpc#%]|\$[\w#.]+/gu;
const ANY = '.*';

function innerExpression(node) {
  if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    return node.expression;
  }
  return ts.isTaggedTemplateExpression(node) ? node.tag : undefined;
}

function calleeNames(expression) {
  const names = [];
  let current = expression;
  while (current !== undefined && !ts.isIdentifier(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
    }
    current = innerExpression(current);
  }
  return current === undefined ? undefined : [current.text, ...names];
}

function isEachTable(call) {
  return ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === EACH;
}

function literalPattern(text, each) {
  return each ? text.split(FORMAT_TOKEN).map(escapeRegExp).join(ANY) : escapeRegExp(text);
}

function titleLeaves(node) {
  const pending = [node];
  const leaves = [];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current !== undefined && ts.isParenthesizedExpression(current)) {
      pending.unshift(current.expression);
    } else if (current !== undefined && isPlus(current)) {
      pending.unshift(current.left, current.right);
    } else {
      leaves.push(current);
    }
  }
  return leaves;
}

function isPlus(node) {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function leafPattern(node, each) {
  if (node !== undefined && ts.isStringLiteralLike(node)) {
    return literalPattern(node.text, each);
  }
  if (node !== undefined && ts.isTemplateExpression(node)) {
    return [
      literalPattern(node.head.text, each),
      ...node.templateSpans.map((span) => `${ANY}${literalPattern(span.literal.text, each)}`),
    ].join('');
  }
  return ANY;
}

function titlePattern(node, each) {
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
