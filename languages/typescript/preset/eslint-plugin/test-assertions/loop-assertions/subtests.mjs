import { callbackOf } from '../../test-quality/test-calls.mjs';
import { propertyName } from '../unowned-async/nodes.mjs';

const SUBTEST_NAMES = new Set(['test', 'it']);

export function subtestCallback(call) {
  const { callee } = call;
  const isSubtest =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    SUBTEST_NAMES.has(propertyName(callee));
  return isSubtest ? callbackOf(call) : undefined;
}
