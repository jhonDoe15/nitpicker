import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { findVariable, isFunctionNode, stringValue } from '../analysis/constant-resolution.mjs';
import { memberName, unwrapped } from '../security/security-values.mjs';
import { createBindings, isEmitterCreation, isServerCreation } from './emitter-creations.mjs';
import { CONNECTION_EVENTS, LISTEN_METHODS } from './emitter-modules.mjs';
import { referencesOutcome } from './error-handling.mjs';

const CLASSES = new Set(['ClassBody']);

function fieldKey(member) {
  if (member?.type !== 'MemberExpression' || member.computed) {
    return undefined;
  }
  const { property } = member;
  if (property.type === 'PrivateIdentifier') {
    return `#${property.name}`;
  }
  return property.type === 'Identifier' ? property.name : undefined;
}

function thisField(member) {
  return member?.type === 'MemberExpression' && member.object.type === 'ThisExpression'
    ? fieldKey(member)
    : undefined;
}

function definitionKey(definition) {
  if (definition.computed) {
    return undefined;
  }
  const { key } = definition;
  return key.type === 'PrivateIdentifier' ? `#${key.name}` : key.name;
}

function enclosingClass(node) {
  return ancestorsOf(node).find((ancestor) => CLASSES.has(ancestor.type));
}

function fieldReferences(classBody, key, written) {
  return [...depthFirst(classBody, objectChildren)].filter(
    (node) => node !== written && thisField(node) === key,
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

function connectionListener(context, call, bindingsFor) {
  const { callee } = call;
  if (isServerCreation(context, call, bindingsFor)) {
    return call.arguments.findLast(isFunctionNode);
  }
  const listens =
    callee.type === 'MemberExpression' &&
    LISTEN_METHODS.has(memberName(callee)) &&
    CONNECTION_EVENTS.has(stringValue(call.arguments[0])) &&
    isServerReceiver(context, callee.object, bindingsFor);
  return listens && isFunctionNode(call.arguments[1]) ? call.arguments[1] : undefined;
}

function isServerReceiver(context, receiver, bindingsFor) {
  const target = unwrapped(receiver);
  if (target.type !== 'Identifier') {
    return isServerCreation(context, target, bindingsFor);
  }
  const definition = findVariable(context, target, target.name)?.defs.at(0);
  return definition?.type === 'Variable' && isServerCreation(context, definition.node.init, bindingsFor);
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
    let bindingsFor;

    function check(node, name, references) {
      if (referencesOutcome(context, references, bindingsFor) === 'unhandled') {
        context.report({ node, messageId: 'missingListener', data: { name } });
      }
    }

    function checkVariable(node, identifier) {
      const variable = findVariable(context, identifier, identifier.name);
      if (variable !== undefined) {
        check(node, identifier.name, variableReferences(variable, identifier));
      }
    }

    function checkField(node, key, written) {
      const classBody = enclosingClass(node);
      if (classBody !== undefined) {
        check(node, `this.${key}`, fieldReferences(classBody, key, written));
      }
    }

    return {
      Program(program) {
        bindingsFor = createBindings(program);
      },
      VariableDeclarator(node) {
        if (node.id.type === 'Identifier' && !isExported(node) && isEmitterCreation(context, node.init, bindingsFor)) {
          checkVariable(node.init, node.id);
        }
      },
      AssignmentExpression(node) {
        if (node.operator !== '=' || !isEmitterCreation(context, node.right, bindingsFor)) {
          return;
        }
        const key = thisField(node.left);
        if (key !== undefined) {
          checkField(node.right, key, node.left);
        } else if (node.left.type === 'Identifier') {
          checkVariable(node.right, node.left);
        }
      },
      PropertyDefinition(node) {
        const key = definitionKey(node);
        if (key !== undefined && !node.static && isEmitterCreation(context, node.value, bindingsFor)) {
          checkField(node.value, key, undefined);
        }
      },
      'CallExpression, NewExpression'(node) {
        const listener = connectionListener(context, node, bindingsFor);
        const socket = listener?.params[0];
        if (socket?.type === 'Identifier') {
          const variable = context.sourceCode.getDeclaredVariables(listener).find((entry) => entry.name === socket.name);
          check(socket, socket.name, variableReferences(variable, socket));
        }
      },
    };
  },
};
