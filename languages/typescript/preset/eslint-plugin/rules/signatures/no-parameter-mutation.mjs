import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { mutatedOwner, staticName } from '../analysis/mutation/mutating-methods.mjs';

const DRAFT_CALLEES = new Set([
  'produce',
  'produceWithPatches',
  'createSlice',
  'createReducer',
  'useImmer',
  'useImmerReducer',
]);
const ACCUMULATING_CALLEES = new Set(['reduce', 'reduceRight']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function calleeName(call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
    ? callee.property.name
    : undefined;
}

function subscriptStep(node) {
  if (node.type === 'TSNonNullExpression') {
    return node.expression;
  }
  return node.type === 'MemberExpression' && node.computed ? node.object : undefined;
}

function subscriptRoot(node) {
  const chain = [node];
  for (const current of chain) {
    const next = subscriptStep(current);
    if (next !== undefined) {
      chain.push(next);
    }
  }
  const root = chain.at(-1);
  return root.type === 'Identifier' ? root : undefined;
}

function parameterOf(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === 'Parameter' ? definition : undefined;
}

function isDraftOrAccumulator(definition) {
  const owner = definition.node;
  const call = owner.parent;
  if (call?.type === 'CallExpression' && call.arguments.includes(owner)) {
    const accumulates =
      ACCUMULATING_CALLEES.has(calleeName(call)) && owner.params[0] === definition.name;
    if (accumulates) {
      return true;
    }
  }
  return ancestorsOf(owner).some(
    (ancestor) => ancestor.type === 'CallExpression' && DRAFT_CALLEES.has(calleeName(ancestor)),
  );
}

function isMutableIndexed(services, node) {
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(node);
  const parts = type.isUnion() ? type.types : [type];
  return parts.some((part) =>
    checker.getIndexInfosOfType(checker.getApparentType(part)).some((info) => !info.isReadonly),
  );
}

function textOf(sourceCode, node) {
  return sourceCode.getText(node).replaceAll(/\s+/g, ' ');
}

function reportIfParameter({ context, sourceCode }, { node, target, name }) {
  const root = subscriptRoot(target);
  const definition = root === undefined ? undefined : parameterOf(sourceCode, root);
  if (
    definition !== undefined &&
    FUNCTIONS.has(definition.node.type) &&
    !isDraftOrAccumulator(definition)
  ) {
    context.report({ node, messageId: 'parameterMutation', data: { name } });
  }
}

function checkWrite(scope, node, target) {
  const { services, sourceCode } = scope;
  const writesElement =
    target.type === 'MemberExpression' && (target.computed || target.property.name === 'length');
  if (writesElement && isMutableIndexed(services, target.object)) {
    const name = `${textOf(sourceCode, target.object)}[…]`;
    reportIfParameter(scope, { node, target: target.object, name });
  }
}

function checkCall(scope, node) {
  const { callee } = node;
  if (callee.type !== 'MemberExpression') {
    return;
  }
  const method = staticName(callee, scope.services);
  if (method !== undefined && mutatedOwner(callee, method, scope.services) !== undefined) {
    const name = `${textOf(scope.sourceCode, callee.object)}.${method}`;
    reportIfParameter(scope, { node, target: callee.object, name });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow changing an array, Set, Map or indexed object that a parameter holds in place',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      parameterMutation:
        '`{{ name }}` changes the value the caller passed in. Build and return a new value instead (`[...items, item]`, `new Set([...set, item])`, `{ ...table, [key]: value }`, `items.toSorted()`), or copy the parameter first (`const copy = [...items]`).',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const scope = { context, sourceCode, services };
    return {
      CallExpression: (node) => checkCall(scope, node),
      AssignmentExpression: (node) => checkWrite(scope, node, node.left),
      UpdateExpression: (node) => checkWrite(scope, node, node.argument),
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          checkWrite(scope, node, node.argument);
        }
      },
    };
  },
};
