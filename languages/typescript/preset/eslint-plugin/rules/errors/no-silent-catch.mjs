import { flowsOut } from '../support/error-flow.mjs';
import { isFailureResult, reportsFailure, setsFailureState } from './failure-shapes.mjs';

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const ERROR_RETURN_TYPE = /Error|Exception|Result|Either|Failure|Outcome|unknown|any/;

function isPromiseCatchCallback(fn) {
  const call = fn.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments[0] === fn &&
    call.callee.type === 'MemberExpression' &&
    call.callee.property.name === 'catch'
  );
}

function enclosingFunction(node) {
  const chain = [node.parent];
  for (const current of chain) {
    if (current && !FUNCTION_TYPES.has(current.type)) {
      chain.push(current.parent);
    }
  }
  return chain.at(-1);
}

function depthVisitors(state, onEnter, onExit) {
  function enter(node) {
    state.depth += 1;
    onEnter(node);
  }
  function exit(node) {
    onExit(node);
    state.depth -= 1;
  }
  return Object.fromEntries(
    [...FUNCTION_TYPES].flatMap((type) => [
      [type, enter],
      [`${type}:exit`, exit],
    ]),
  );
}

function markHandled(tracker, when) {
  const current = tracker.catches.at(-1);
  if (current !== undefined && current.depth === tracker.state.depth && when(current)) {
    current.handled = true;
  }
}

function acceptsReturn(sourceCode, statement) {
  const returnType = enclosingFunction(statement)?.returnType;
  return returnType === undefined || ERROR_RETURN_TYPE.test(sourceCode.getText(returnType));
}

function reportUnlessHandled(tracker, node) {
  const { context, sourceCode } = tracker;
  const { handled } = tracker.catches.pop();
  const options = {
    catchNode: node,
    sourceCode,
    acceptsReturn: (statement) => acceptsReturn(sourceCode, statement),
  };
  const flows = sourceCode
    .getDeclaredVariables(node)
    .flatMap((variable) => variable.references)
    .some((reference) => flowsOut(reference.identifier, options));
  if (!handled && !flows) {
    context.report({ node, messageId: 'silent' });
  }
}

function functionVisitors(tracker) {
  function enterFunction(node) {
    if (!isPromiseCatchCallback(node)) {
      return;
    }
    const returnsFailure = node.body.type !== 'BlockStatement' && isFailureResult(node.body);
    tracker.catches.push({ node, depth: tracker.state.depth, handled: returnsFailure });
  }
  function exitFunction(node) {
    if (isPromiseCatchCallback(node)) {
      reportUnlessHandled(tracker, node);
    }
  }
  return depthVisitors(tracker.state, enterFunction, exitFunction);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a catch clause to throw, return a failure result or hand the caught value on',
    },
    schema: [],
    messages: {
      silent: [
        'This catch only logs the failure or returns a default, and carries on.',
        "Rethrow with the cause (`throw new FeatureError('failed', { cause: error })`),",
        "return a failure result (`return { kind: 'malformed-json' }`, `return { ok: false, error }`)",
        'or report it to the caller (an HTTP error response, an error state shown to the user).',
        'If dropping it is intended, add an exception for nitpicker/no-silent-catch in nitpicker.config.json.',
      ].join(' '),
    },
  },
  create(context) {
    const tracker = { context, sourceCode: context.sourceCode, state: { depth: 0 }, catches: [] };
    return {
      ...functionVisitors(tracker),
      CatchClause(node) {
        tracker.catches.push({ node, depth: tracker.state.depth, handled: false });
      },
      ThrowStatement() {
        markHandled(tracker, () => true);
      },
      ReturnStatement(node) {
        markHandled(tracker, () => isFailureResult(node.argument));
      },
      CallExpression(node) {
        markHandled(tracker, () => reportsFailure(node));
      },
      AssignmentExpression(node) {
        markHandled(tracker, () => setsFailureState(node));
      },
      'CatchClause:exit'(node) {
        reportUnlessHandled(tracker, node);
      },
    };
  },
};
