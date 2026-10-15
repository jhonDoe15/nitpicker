import { flowsOut } from './support/error-flow.mjs';

const FAILURE_KEYS = new Set([
  'kind',
  'ok',
  'success',
  'status',
  'error',
  'errors',
  'reason',
  'type',
  'code',
  'failure',
  'outcome',
]);
const MEMBER = 'MemberExpression';
const FAILURE_CONSTRUCTORS = /^(?:err|fail|failure|left)$/i;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

function keyName(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function calleeName({ callee }) {
  return callee.type === MEMBER ? callee.property.name : callee.name;
}

function isFailureResult(argument) {
  if (argument?.type === 'ObjectExpression') {
    return argument.properties.some((property) => FAILURE_KEYS.has(keyName(property)));
  }
  return (
    argument?.type === 'CallExpression' && FAILURE_CONSTRUCTORS.test(calleeName(argument) ?? '')
  );
}

function isProcessExit(node) {
  const { callee } = node;
  return (
    callee.type === MEMBER && callee.object.name === 'process' && callee.property.name === 'exit'
  );
}

function setsExitCode({ left }) {
  return (
    left.type === MEMBER && left.object.name === 'process' && left.property.name === 'exitCode'
  );
}

function depthVisitors(state) {
  function enter() {
    state.depth += 1;
  }
  function exit() {
    state.depth -= 1;
  }
  return Object.fromEntries(
    [...FUNCTION_TYPES].flatMap((type) => [
      [type, enter],
      [`${type}:exit`, exit],
    ]),
  );
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
        "Rethrow with the cause (`throw new FeatureError('failed', { cause: error })`)",
        "or return a failure result (`return { kind: 'malformed-json' }`, `return { ok: false, error }`).",
        'If dropping it is intended, add an exception for nitpicker/no-silent-catch in nitpicker.config.json.',
      ].join(' '),
    },
  },
  create(context) {
    const { sourceCode } = context;
    const state = { depth: 0 };
    const catches = [];

    function markHandled(when) {
      const current = catches.at(-1);
      if (current !== undefined && current.depth === state.depth && when(current)) {
        current.handled = true;
      }
    }

    function reportUnlessHandled(node) {
      const { handled } = catches.pop();
      const flows = sourceCode
        .getDeclaredVariables(node)
        .flatMap((variable) => variable.references)
        .some((reference) => flowsOut(reference.identifier, { catchNode: node, sourceCode }));
      if (!handled && !flows) {
        context.report({ node, messageId: 'silent' });
      }
    }

    return {
      ...depthVisitors(state),
      CatchClause(node) {
        catches.push({ node, depth: state.depth, handled: false });
      },
      ThrowStatement() {
        markHandled(() => true);
      },
      ReturnStatement(node) {
        markHandled(() => isFailureResult(node.argument));
      },
      CallExpression(node) {
        markHandled(() => isProcessExit(node));
      },
      AssignmentExpression(node) {
        markHandled(() => setsExitCode(node));
      },
      'CatchClause:exit': reportUnlessHandled,
    };
  },
};
