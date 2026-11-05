import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
} from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { createBindings, isEmitterCreation, isServerCreation } from './emitter-creations.mjs';
import { isConnectionEvent, isListenMethod } from './emitter-modules.mjs';
import { referencesOutcome } from './error-handling.mjs';

const ASSIGNMENTS = new Set(['=', '??=', '||=']);
const OWN_THIS = new Set(['MethodDefinition', 'PropertyDefinition']);

function keyName(key, computed) {
  if (key.type === 'PrivateIdentifier') {
    return `#${key.name}`;
  }
  return !computed && key.type === 'Identifier' ? key.name : stringValue(key);
}

function thisField(member) {
  const isField = member?.type === 'MemberExpression' && member.object.type === 'ThisExpression';
  return isField ? keyName(member.property, member.computed) : undefined;
}

function hasOtherThis(node, root) {
  if (node === root) {
    return false;
  }
  const isFunction = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression';
  return node.type === 'ClassBody' || (isFunction && !OWN_THIS.has(node.parent?.type));
}

function isThisAlias(node) {
  return (
    node.type === 'ThisExpression' &&
    node.parent?.type === 'VariableDeclarator' &&
    node.parent.init === node
  );
}

function fieldReferences(classBody, key, written) {
  const nodes = depthFirst(classBody, (node) =>
    hasOtherThis(node, classBody) ? [] : objectChildren(node),
  );
  return [...nodes].filter(
    (node) => node !== written && (thisField(node) === key || isThisAlias(node)),
  );
}

function variableReferences(variable, written) {
  return variable.references
    .filter((reference) => !reference.init && reference.identifier !== written)
    .map((reference) => reference.identifier);
}

function isExported(declarator) {
  return declarator.parent?.parent?.type === 'ExportNamedDeclaration';
}

function isServerReceiver(scope, receiver) {
  const target = unwrapped(receiver);
  if (target.type !== 'Identifier') {
    return isServerCreation(scope, target);
  }
  const definition = findVariable(scope.context, target, target.name)?.defs.at(0);
  return definition?.type === 'Variable' && isServerCreation(scope, definition.node.init);
}

function listenerFunction(context, node) {
  return isFunctionNode(node) ? node : resolveFunction(context, node);
}

function connectionListener(scope, call) {
  const { context } = scope;
  const { callee } = call;
  if (isServerCreation(scope, call)) {
    return call.arguments.map((argument) => listenerFunction(context, argument)).findLast(Boolean);
  }
  const listens =
    callee.type === 'MemberExpression' &&
    isListenMethod(memberName(callee)) &&
    isConnectionEvent(stringValue(resolveConstant(context, call.arguments[0]))) &&
    isServerReceiver(scope, callee.object);
  return listens ? listenerFunction(context, call.arguments[1]) : undefined;
}

function check(scope, { node, name, references }) {
  if (referencesOutcome(scope, references) === 'unhandled') {
    scope.context.report({ node, messageId: 'missingListener', data: { name } });
  }
}

function checkVariable(scope, node, identifier) {
  const variable = findVariable(scope.context, identifier, identifier.name);
  if (variable !== undefined) {
    const references = variableReferences(variable, identifier);
    check(scope, { node, name: identifier.name, references });
  }
}

function checkField(scope, node, { key, written }) {
  const classBody = ancestorsOf(node).find((ancestor) => ancestor.type === 'ClassBody');
  if (classBody !== undefined) {
    const references = fieldReferences(classBody, key, written);
    check(scope, { node, name: `this.${key}`, references });
  }
}

function checkAssignment(scope, node) {
  if (!ASSIGNMENTS.has(node.operator) || !isEmitterCreation(scope, node.right)) {
    return;
  }
  const key = thisField(node.left);
  if (key !== undefined) {
    checkField(scope, node.right, { key, written: node.left });
  } else if (node.left.type === 'Identifier') {
    checkVariable(scope, node.right, node.left);
  }
}

function checkConnection(scope, node) {
  const listener = connectionListener(scope, node);
  const socket = listener?.params[0];
  if (socket?.type !== 'Identifier') {
    return;
  }
  const variable = scope.context.sourceCode
    .getDeclaredVariables(listener)
    .find((entry) => entry.name === socket.name);
  check(scope, { node: socket, name: socket.name, references: variableReferences(variable) });
}

function visitors(scope) {
  return {
    VariableDeclarator(node) {
      const stored = node.id.type === 'Identifier' && !isExported(node);
      if (stored && isEmitterCreation(scope, node.init)) {
        checkVariable(scope, node.init, node.id);
      }
    },
    AssignmentExpression(node) {
      checkAssignment(scope, node);
    },
    PropertyDefinition(node) {
      const key = keyName(node.key, node.computed);
      if (key !== undefined && !node.static && isEmitterCreation(scope, node.value)) {
        checkField(scope, node.value, { key, written: undefined });
      }
    },
    'CallExpression, NewExpression'(node) {
      checkConnection(scope, node);
    },
  };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Require an 'error' listener on streams, sockets, child processes and clients",
    },
    schema: [],
    messages: {
      missingListener:
        "`{{name}}` emits 'error' when its connection, file or process fails, and Node.js throws an 'error' event that has no listener, which stops the process. Attach one where it is created: `{{name}}.on('error', (error) => ...)`, or hand it to `pipeline(...)` or `finished(...)` from `node:stream/promises`, to `events.once(...)`, or read it with `for await`. An exception fits only when a crash of the process is the intended outcome.",
    },
  },
  create(context) {
    return visitors({ context, bindingsFor: createBindings(context.sourceCode.ast) });
  },
};
