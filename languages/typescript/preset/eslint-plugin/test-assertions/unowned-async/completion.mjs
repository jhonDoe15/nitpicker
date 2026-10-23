import { ancestorsOf } from '../../rules/analysis/ancestry.mjs';
import { chainHasProperty } from '../../test-quality/test-calls.mjs';
import { propertyName } from './hosts.mjs';

const COMPLETIONS = new Set(['AwaitExpression', 'ReturnStatement', 'YieldExpression']);
const CARRIERS = new Set([
  'ArrayExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
  'CallExpression',
  'NewExpression',
  'MemberExpression',
  'SpreadElement',
]);
const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression']);
const PLAN_METHODS = new Set(['assertions', 'plan']);
const VITEST_SOURCE = /^vitest(?:\/|$)/u;

function isPromiseExecutor(node) {
  const owner = node.parent;
  return (
    FUNCTION_TYPES.has(node.type) &&
    owner?.type === 'NewExpression' &&
    owner.callee.type === 'Identifier' &&
    owner.callee.name === 'Promise' &&
    owner.arguments[0] === node
  );
}

function carriedTo(context, node, test) {
  const { parent } = node;
  if (COMPLETIONS.has(parent.type) || (parent === test && parent.body === node)) {
    return { completed: true };
  }
  if (CARRIERS.has(parent.type)) {
    return { next: [parent] };
  }
  const isBinding =
    parent.type === 'VariableDeclarator' && parent.init === node && parent.id.type === 'Identifier';
  if (!isBinding) {
    return { next: [] };
  }
  const [variable] = context.sourceCode.getDeclaredVariables(parent);
  return { next: variable.references.filter((ref) => !ref.init).map((ref) => ref.identifier) };
}

function isCompleted(context, promise, test) {
  const pending = [promise];
  for (const node of pending) {
    const carried = carriedTo(context, node, test);
    if (carried.completed) {
      return true;
    }
    pending.push(...carried.next.filter((next) => !pending.includes(next)));
  }
  return false;
}

export function isInsideCompletedPromise(context, host, test) {
  const ancestors = ancestorsOf(host.node);
  const executors = ancestors.slice(0, ancestors.indexOf(test)).filter(isPromiseExecutor);
  return executors.some((executor) => isCompleted(context, executor.parent, test));
}

function usesVitest(program) {
  return program.body.some(
    (statement) =>
      statement.type === 'ImportDeclaration' && VITEST_SOURCE.test(String(statement.source.value)),
  );
}

function importsNodeTest(program) {
  return program.body.some(
    (statement) => statement.type === 'ImportDeclaration' && statement.source.value === 'node:test',
  );
}

function doneParameter(program, test, call) {
  const isTable = ['each', 'for'].some((name) => chainHasProperty(call.callee, name));
  if (test.async || isTable || usesVitest(program)) {
    return undefined;
  }
  const parameter = test.params[importsNodeTest(program) ? 1 : 0];
  return parameter?.type === 'Identifier' ? parameter : undefined;
}

export function takesDone(context, test, call) {
  const parameter = doneParameter(context.sourceCode.ast, test, call);
  if (parameter === undefined) {
    return false;
  }
  const variable = context.sourceCode
    .getDeclaredVariables(test)
    .find((candidate) => candidate.name === parameter.name);
  return variable !== undefined && variable.references.length > 0;
}

function planCount(statement, test) {
  const call = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  const callee = call?.type === 'CallExpression' ? call.callee : undefined;
  const receiver = callee?.type === 'MemberExpression' ? callee.object : undefined;
  const contextName = test.params[0]?.type === 'Identifier' ? test.params[0].name : undefined;
  const isPlanner =
    receiver?.type === 'Identifier' && ['expect', contextName].includes(receiver.name);
  const method = isPlanner ? propertyName(callee) : undefined;
  if (method === 'hasAssertions') {
    return { atLeastOne: true };
  }
  const [count] = PLAN_METHODS.has(method) ? call.arguments : [];
  return Number.isInteger(count?.value) && count.value >= 1 ? { count: count.value } : undefined;
}

export function isOwnedByPlan(test, syncAssertions) {
  const statements = test.body.type === 'BlockStatement' ? test.body.body : [];
  const plans = statements.map((statement) => planCount(statement, test)).filter(Boolean);
  return plans.some((plan) =>
    plan.atLeastOne ? syncAssertions === 0 : plan.count > syncAssertions,
  );
}
