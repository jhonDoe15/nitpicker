import { stringValue } from '../analysis/constant-resolution.mjs';
import { isUrlLike } from './origins/receivers.mjs';
import { nameOf, unwrap } from './origins/http-origins.mjs';

const URL_PARTS = new Set(['protocol', 'hostname', 'host', 'origin']);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const TEXT_METHODS = new Set(['startsWith', 'endsWith', 'includes']);

function urlPart(context, node) {
  const member = unwrap(node);
  const part = member?.type === 'MemberExpression' && !member.computed ? nameOf(member) : undefined;
  const owner = part !== undefined && URL_PARTS.has(part) ? unwrap(member.object) : undefined;
  return owner !== undefined && isUrlLike(context, owner, nameOf(owner)) ? part : undefined;
}

function capitals(node) {
  return /[A-Z]/.test(stringValue(unwrap(node)) ?? '');
}

export function urlCase(context, node) {
  let pair;
  if (node.type === 'BinaryExpression' && EQUALITY.has(node.operator)) {
    pair = capitals(node.right) ? [node.left, node.right] : [node.right, node.left];
  } else if (node.type === 'CallExpression') {
    const callee = unwrap(node.callee);
    const method = callee.type === 'MemberExpression' ? nameOf(callee) : undefined;
    pair = TEXT_METHODS.has(method) ? [callee.object, node.arguments[0]] : undefined;
  }
  const part = pair === undefined ? undefined : urlPart(context, pair[0]);
  return part !== undefined && capitals(pair[1])
    ? { node, messageId: 'urlCase', data: { part } }
    : undefined;
}
