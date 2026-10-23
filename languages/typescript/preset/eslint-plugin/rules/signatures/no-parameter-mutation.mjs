import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { mutatedOwner, staticName } from '../analysis/mutating-methods.mjs';

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

function subscriptRoot(node) {
  let current = node;
  while (
    (current.type === 'MemberExpression' && current.computed) ||
    current.type === 'TSNonNullExpression'
  ) {
    current = current.type === 'TSNonNullExpression' ? current.expression : current.object;
  }
  return current.type === 'Identifier' ? current : undefined;
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

    function reportIfParameter(node, target, name) {
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

    function checkWrite(node, target) {
      if (
        target.type !== 'MemberExpression' ||
        !(target.computed || target.property.name === 'length')
      ) {
        return;
      }
      if (isMutableIndexed(services, target.object)) {
        reportIfParameter(node, target.object, `${textOf(sourceCode, target.object)}[…]`);
      }
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression') {
          return;
        }
        const method = staticName(callee, services);
        if (method !== undefined && mutatedOwner(callee, method, services) !== undefined) {
          reportIfParameter(node, callee.object, `${textOf(sourceCode, callee.object)}.${method}`);
        }
      },
      AssignmentExpression(node) {
        checkWrite(node, node.left);
      },
      UpdateExpression(node) {
        checkWrite(node, node.argument);
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          checkWrite(node, node.argument);
        }
      },
    };
  },
};
