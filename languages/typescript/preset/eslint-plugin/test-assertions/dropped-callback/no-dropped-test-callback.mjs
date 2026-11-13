import { ts } from '../../../../typescript-api/typescript-api.mjs';

const WRAPPERS = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression']);
const MESSAGE =
  'This call returns a function that is dropped, so it never runs and the check inside it never happens. Call it (`check(ctx)()`), pass it on (`run(check(ctx))`) or assign it. An exception fits only a function that returns a callback on purpose.';

const REGISTRATIONS =
  /^(subscribe|on|once|addListener|addEventListener|listen|watch|observe|on[A-Z].*)$/;

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
    ? callee.property.name
    : '';
}

function isFunctionNode(node) {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function takesFunctionReturningVoid(checker, services, call) {
  return call.arguments.some((argument) => {
    if (!isFunctionNode(argument)) {
      return false;
    }
    const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(argument));
    return type.getCallSignatures().some((signature) => {
      const returned = signature.getReturnType();
      return returned
        .getCallSignatures()
        .some(
          (inner) =>
            inner.getParameters().length === 0 &&
            (inner.getReturnType().flags & ts.TypeFlags.Void) !== 0,
        );
    });
  });
}

function unwrapped(node) {
  const pending = [node];
  for (const current of pending) {
    if (!WRAPPERS.has(current.type)) {
      return current;
    }
    pending.push(current.expression);
  }
  return node;
}

function isPlainFunction(type) {
  return type.getCallSignatures().length > 0 && type.getProperties().length === 0;
}

function returnsVoid(contextual) {
  return (
    contextual !== undefined &&
    contextual
      .getCallSignatures()
      .some((signature) => (signature.getReturnType().flags & ts.TypeFlags.Void) !== 0)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dropping the function a call returns in a test',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: { dropped: MESSAGE },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === null || services?.program === undefined) {
      return {};
    }
    const checker = services.program.getTypeChecker();

    function returnsFunction(call) {
      if (
        REGISTRATIONS.test(calleeName(call.callee)) ||
        takesFunctionReturningVoid(checker, services, call)
      ) {
        return false;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(call);
      return isPlainFunction(checker.getTypeAtLocation(tsNode));
    }

    return {
      ExpressionStatement(node) {
        const call = unwrapped(node.expression);
        if (call.type === 'CallExpression' && returnsFunction(call)) {
          context.report({ node: call, messageId: 'dropped' });
        }
      },
      'ArrowFunctionExpression[expression=true]'(node) {
        const call = unwrapped(node.body);
        const contextual = checker.getContextualType(services.esTreeNodeToTSNodeMap.get(node));
        if (call.type === 'CallExpression' && returnsVoid(contextual) && returnsFunction(call)) {
          context.report({ node: call, messageId: 'dropped' });
        }
      },
    };
  },
};
