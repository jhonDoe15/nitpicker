import { findVariable, perTestVisitors } from './test-code-analysis.mjs';

// Roots whose calls are cheap and deterministic: memoizing them saves nothing worth a hook.
const CHEAP_CALL_ROOTS = new Set([
  'path',
  'Math',
  'Object',
  'JSON',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Date',
  'URL',
]);
const MEMO_LOGICAL_OPERATORS = new Set(['??=', '||=']);

function calleeRoot(callee) {
  let current = callee;
  while (current?.type === 'MemberExpression' || current?.type === 'CallExpression') {
    current = current.type === 'MemberExpression' ? current.object : current.callee;
  }
  return current?.type === 'Identifier' ? current.name : undefined;
}

/** The call, widened to `await call` when awaited, whose value an assignment would store. */
function storedValue(call) {
  return call.parent.type === 'AwaitExpression' ? call.parent : call;
}

function isModuleLevelMutable(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return (
    variable?.scope.type === 'module' &&
    definition?.type === 'Variable' &&
    definition.parent.kind !== 'const'
  );
}

function isNamed(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function isNullish(node) {
  return (
    (node?.type === 'Literal' && node.value === null && node.raw === 'null') ||
    isNamed(node, 'undefined')
  );
}

/** `!x`, `x === undefined`, `x == null`, `x === null` (either side), for the memo `name`. */
function isEmptyCheck(test, name) {
  if (test.type === 'UnaryExpression' && test.operator === '!') return isNamed(test.argument, name);
  if (test.type !== 'BinaryExpression' || !['==', '==='].includes(test.operator)) return false;
  return (
    (isNamed(test.left, name) && isNullish(test.right)) ||
    (isNamed(test.right, name) && isNullish(test.left))
  );
}

/** `x`, `x !== undefined`, `x != null`, for the early-return form of the memo. */
function isPresentCheck(test, name) {
  if (isNamed(test, name)) return true;
  if (test.type !== 'BinaryExpression' || !['!=', '!=='].includes(test.operator)) return false;
  return (
    (isNamed(test.left, name) && isNullish(test.right)) ||
    (isNamed(test.right, name) && isNullish(test.left))
  );
}

function returns(statement) {
  if (statement.type === 'ReturnStatement') return true;
  return statement.type === 'BlockStatement' && statement.body.at(-1)?.type === 'ReturnStatement';
}

/** True when the assignment statement only runs while `name` is still empty. */
function isGuardedByEmptyCheck(statement, name) {
  const container = statement.parent;
  const branch = container.type === 'BlockStatement' ? container : statement;
  const conditional = branch.parent;
  if (conditional.type === 'IfStatement' && conditional.consequent === branch) {
    return isEmptyCheck(conditional.test, name);
  }
  if (container.type !== 'BlockStatement') return false;
  const before = container.body.slice(0, container.body.indexOf(statement));
  return before.some(
    (earlier) =>
      earlier.type === 'IfStatement' &&
      earlier.alternate === null &&
      returns(earlier.consequent) &&
      isPresentCheck(earlier.test, name),
  );
}

/** The memo variable a call's value is lazily stored in, or undefined when it is not a memo. */
function memoTarget(value) {
  const parent = value.parent;
  if (parent.type === 'LogicalExpression' && parent.right === value) {
    const assignment = parent.parent;
    const isSelfFallback =
      assignment.type === 'AssignmentExpression' &&
      assignment.operator === '=' &&
      assignment.left.type === 'Identifier' &&
      ['??', '||'].includes(parent.operator) &&
      isNamed(parent.left, assignment.left.name);
    return isSelfFallback ? assignment.left : undefined;
  }
  if (parent.type !== 'AssignmentExpression' || parent.right !== value) return undefined;
  if (parent.left.type !== 'Identifier') return undefined;
  if (MEMO_LOGICAL_OPERATORS.has(parent.operator)) return parent.left;
  const statement = parent.parent;
  if (parent.operator === '=' && statement.type === 'ExpressionStatement') {
    return isGuardedByEmptyCheck(statement, parent.left.name) ? parent.left : undefined;
  }
  return undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      chargedSetup: `"{{name}}" is memoized lazily at module level and filled by a call, so whichever test runs first pays for its setup, reports show that test as slow, and test order starts to matter. Compute it once in beforeAll and let tests read it. If the setup is cheap or the lazy memo is intended, add an exception for this rule in nitpicker.config.json.`,
    },
  },
  create(context) {
    return perTestVisitors(context, (node) => {
      if (node.type !== 'CallExpression' || CHEAP_CALL_ROOTS.has(calleeRoot(node.callee))) {
        return undefined;
      }
      const target = memoTarget(storedValue(node));
      if (!target || !isModuleLevelMutable(context, target)) return undefined;
      return { messageId: 'chargedSetup', data: { name: target.name } };
    });
  },
};
