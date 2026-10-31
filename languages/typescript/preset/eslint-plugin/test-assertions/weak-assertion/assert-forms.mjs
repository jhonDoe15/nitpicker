import { memberName } from '../../rules/analysis/test-code-analysis.mjs';
import {
  lengthName,
  nonEmptyComparison,
  nullishName,
  isNumber,
  presenceComparison,
} from './values.mjs';

function isAssertObject(node) {
  const isStrict = node.type === 'MemberExpression' && memberName(node) === 'strict';
  const base = isStrict ? node.object : node;
  return base.type === 'Identifier' && base.name === 'assert';
}

function assertMethod(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'assert' ? 'ok' : undefined;
  }
  if (callee.type !== 'MemberExpression' || !isAssertObject(callee.object)) {
    return undefined;
  }
  return memberName(callee);
}

const NOT_EQUAL_METHODS = new Set(['notEqual', 'notStrictEqual']);

function notEqualForm([first, second]) {
  const absent = nullishName(second) ?? nullishName(first);
  if (absent !== undefined) {
    return { family: 'presence', absent };
  }
  const isZeroLength =
    (lengthName(first) !== undefined && isNumber(second, 0)) ||
    (lengthName(second) !== undefined && isNumber(first, 0));
  return isZeroLength ? { family: 'nonEmpty' } : undefined;
}

function okForm([condition]) {
  const presence = presenceComparison(condition);
  if (presence) {
    return { family: 'presence', absent: presence.absent, narrowed: presence.subject };
  }
  const isNonEmpty =
    nonEmptyComparison(condition) !== undefined || lengthName(condition) !== undefined;
  return isNonEmpty ? { family: 'nonEmpty' } : undefined;
}

export function assertForm(call) {
  const method = assertMethod(call.callee);
  if (method === 'ok') {
    return okForm(call.arguments);
  }
  return NOT_EQUAL_METHODS.has(method) ? notEqualForm(call.arguments) : undefined;
}
