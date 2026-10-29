import { mutatedOwner, staticName } from '../analysis/mutation/mutating-methods.mjs';
import { changedParameter } from './parameter-owners.mjs';

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

function unwrapped(node) {
  return node.type === 'TSNonNullExpression' ? unwrapped(node.expression) : node;
}

function checkWrite(scope, node, written) {
  const { context, services, sourceCode } = scope;
  const target = unwrapped(written);
  const writesElement =
    target.type === 'MemberExpression' && (target.computed || target.property.name === 'length');
  if (
    writesElement &&
    changedParameter(sourceCode, target.object, node) !== undefined &&
    isMutableIndexed(services, target.object)
  ) {
    const name = `${textOf(sourceCode, target.object)}[…]`;
    context.report({ node, messageId: 'parameterMutation', data: { name } });
  }
}

function checkCall(scope, node) {
  const { callee } = node;
  const { context, services, sourceCode } = scope;
  if (
    callee.type !== 'MemberExpression' ||
    changedParameter(sourceCode, callee.object, node) === undefined
  ) {
    return;
  }
  const method = staticName(callee, services);
  if (method !== undefined && mutatedOwner(callee, method, services) !== undefined) {
    const name = `${textOf(sourceCode, callee.object)}.${method}`;
    context.report({ node, messageId: 'parameterMutation', data: { name } });
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
      CallExpression(node) {
        checkCall(scope, node);
      },
      AssignmentExpression(node) {
        checkWrite(scope, node, node.left);
      },
      UpdateExpression(node) {
        checkWrite(scope, node, node.argument);
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') {
          checkWrite(scope, node, node.argument);
        }
      },
    };
  },
};
