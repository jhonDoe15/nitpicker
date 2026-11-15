import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { calleeName } from '../request-inputs/bindings/request-calls.mjs';
import { nameOf } from '../request-inputs/bindings/ts-nodes.mjs';

const IDENTIFIER_WORDS = ['Id', 'Ids', 'Uuid', 'Guid', 'Key', 'Token', 'Code', 'Slug', 'Hash'];
const IDENTIFIER_SUFFIX = [...IDENTIFIER_WORDS, 'Status', 'Type', 'Role', 'Kind'].join('|');
const IDENTIFIER_WHOLE = [
  ...IDENTIFIER_SUFFIX.split('|'),
  'Sort',
  'Order',
  'Page',
  'Limit',
  'Offset',
  'Cursor',
]
  .map((word) => word.toLowerCase())
  .join('|');
const IDENTIFIER_NAME = new RegExp(
  `(?:^|[a-z])(?:${IDENTIFIER_SUFFIX})$|^(?:${IDENTIFIER_WHOLE})$`,
  'u',
);
const LOOKUP_NAMES = [
  'Like|ILike|like|ilike|notLike|eq|ne|Equal|where|andWhere|orWhere',
  'whereLike|whereILike|having|search\\w*|find\\w*By\\w*',
].join('|');
const LOOKUP_CALL = new RegExp(`^(?:${LOOKUP_NAMES})$`, 'u');
const FILTER_CALL =
  /^(?:find|findOne|findAll|findBy|findOneBy|countBy|existsBy|exists|count|countDocuments)$/u;
const SQL_CALL = /^(?:query|execute|raw|queryRaw|\$queryRaw|\$queryRawUnsafe|all|get|run)$/u;
const SQL_TAG = /^(?:sql|query|\$queryRaw)$/u;
const SQL_TEXT = /\b(?:where|like|having)\b/iu;
const TEXT_KEYS = new Set(['contains', 'startsWith', 'endsWith', 'equals', 'search']);
const FILTER_KEYS = new Set(['where', 'filter']);
const PASS_THROUGH = new Set(['toLowerCase', 'toUpperCase', 'toString', 'normalize']);

export function isIdentifierName(name) {
  return name !== undefined && IDENTIFIER_NAME.test(name);
}

export function ancestorsOf(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.parent !== undefined) {
      chain.push(current.parent);
    }
  }
  return chain.slice(1);
}

function isPassThroughCall(parent, current) {
  const callee = ts.isCallExpression(parent) ? parent.expression : undefined;
  return (
    callee === current &&
    ts.isPropertyAccessExpression(callee) &&
    PASS_THROUGH.has(callee.name.text)
  );
}

function passesThrough(parent, current) {
  return (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isNonNullExpression(parent) ||
    ts.isTemplateSpan(parent) ||
    ts.isTemplateExpression(parent) ||
    (ts.isBinaryExpression(parent) && (parent.left === current || isConcatenation(parent))) ||
    (ts.isConditionalExpression(parent) && parent.condition !== current) ||
    (ts.isPropertyAccessExpression(parent) &&
      parent.expression === current &&
      PASS_THROUGH.has(parent.name.text) &&
      ts.isCallExpression(parent.parent)) ||
    isPassThroughCall(parent, current)
  );
}

function isConcatenation(binary) {
  return binary.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function climbed(node) {
  let current = node;
  for (const parent of ancestorsOf(node)) {
    if (!passesThrough(parent, current)) {
      return current;
    }
    current = parent;
  }
  return current;
}

function sqlText(call) {
  const [first] = call.arguments;
  return first !== undefined && ts.isStringLiteralLike(first) && SQL_TEXT.test(first.text);
}

function inCallArgument(call, node) {
  const name = calleeName(call);
  if (name === undefined || !call.arguments.includes(node)) {
    return false;
  }
  return LOOKUP_CALL.test(name) && !isIdentifierName(name.replace(/^find\w*By/u, ''));
}

function filterKeys(node) {
  const keys = [];
  for (const current of ancestorsOf(node)) {
    if (ts.isPropertyAssignment(current)) {
      keys.push(nameOf(current.name));
    }
    if (ts.isCallExpression(current) || ts.isFunctionLike(current)) {
      return { keys, call: ts.isCallExpression(current) ? current : undefined };
    }
  }
  return { keys, call: undefined };
}

function inFilterObject(node, key) {
  if (isIdentifierName(key)) {
    return false;
  }
  if (TEXT_KEYS.has(key)) {
    return true;
  }
  const { keys, call } = filterKeys(node);
  const directArgument =
    keys.length === 0 && call !== undefined && FILTER_CALL.test(calleeName(call));
  return directArgument || keys.some((outer) => FILTER_KEYS.has(outer));
}

function inSql(node) {
  const array = node.parent;
  const call = ts.isArrayLiteralExpression(array) ? array.parent : undefined;
  if (call !== undefined && ts.isCallExpression(call) && call.arguments.includes(array)) {
    return SQL_CALL.test(calleeName(call) ?? '') && sqlText(call);
  }
  const span = node.parent;
  const template = ts.isTemplateSpan(span) ? span.parent.parent : undefined;
  return (
    template !== undefined &&
    ts.isTaggedTemplateExpression(template) &&
    SQL_TAG.test(template.tag.getText())
  );
}

export function reachesLookup(expression) {
  const node = climbed(expression);
  const { parent } = node;
  if (ts.isCallExpression(parent)) {
    return inCallArgument(parent, node);
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return inFilterObject(parent, nameOf(parent.name));
  }
  return ts.isShorthandPropertyAssignment(parent)
    ? inFilterObject(parent, parent.name.text)
    : inSql(node);
}
