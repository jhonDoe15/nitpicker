import { isCallerObject } from '../analysis/mutation/caller-objects.mjs';
import { mutatedOwner, staticName } from '../analysis/mutation/mutating-methods.mjs';
import { changedParameter, isObjectAssign, withoutAssertion } from './parameter-owners.mjs';

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

function isElementWrite(services, target) {
  return (
    isMutableIndexed(services, target.object) &&
    (target.computed || target.property.name === 'length')
  );
}

function callerParameter(scope, object, mutation) {
  const { services, sourceCode } = scope;
  function crossesProperty(member) {
    return isCallerObject(services, member.object, member.property.name);
  }
  return changedParameter({ sourceCode, crossesProperty }, object, mutation);
}

function checkWrite(scope, node, written) {
  const { context, services, sourceCode } = scope;
  const target = withoutAssertion(written);
  if (
    target.type !== 'MemberExpression' ||
    callerParameter(scope, target.object, node) === undefined
  ) {
    return;
  }
  if (isElementWrite(services, target)) {
    const name = `${textOf(sourceCode, target.object)}[…]`;
    context.report({ node, messageId: 'parameterMutation', data: { name } });
    return;
  }
  const property = staticName(target, services);
  if (property !== undefined && isCallerObject(services, target.object, property)) {
    const name = textOf(sourceCode, target);
    context.report({ node, messageId: 'propertyWrite', data: { name } });
  }
}

function checkAssign(scope, node) {
  const { context, services, sourceCode } = scope;
  const [written, ...sources] = node.arguments;
  const first = written === undefined ? undefined : withoutAssertion(written);
  if (
    first !== undefined &&
    sources.length > 0 &&
    first.type !== 'SpreadElement' &&
    callerParameter(scope, first, node) !== undefined &&
    isCallerObject(services, first)
  ) {
    const name = `Object.assign(${textOf(sourceCode, first)}, …)`;
    context.report({ node, messageId: 'propertyWrite', data: { name } });
  }
}

function checkCall(scope, node) {
  const { callee } = node;
  const { context, services, sourceCode } = scope;
  if (isObjectAssign(node)) {
    checkAssign(scope, node);
    return;
  }
  if (
    callee.type !== 'MemberExpression' ||
    callerParameter(scope, callee.object, node) === undefined
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
        'Disallow changing an array, Set, Map, indexed object or project object that a parameter holds in place',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      parameterMutation:
        '`{{ name }}` changes the value the caller passed in. Build and return a new value instead (`[...items, item]`, `new Set([...set, item])`, `{ ...table, [key]: value }`, `items.toSorted()`), or copy the parameter first (`const copy = [...items]`).',
      propertyWrite:
        '`{{ name }}` writes to the object the caller passed in, so a frozen or shared object breaks. Build a new object instead (`{ ...options, timeout: 5000 }`), or copy the parameter first (`const next = { ...options }`). An exception fits only when this function fills an object its caller hands it to be filled.',
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
