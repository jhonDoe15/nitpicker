import { isConcatenation } from '../analysis/static-shapes.mjs';
import {
  hasCredentialShape,
  isHardcodedSecret,
  isSecretName,
} from '../../../../../../shared/naming/secret-words.mjs';
import { loggedSecretNames } from './secret-logs.mjs';
import { staticString } from './secret-values.mjs';

const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';
const LITERAL = 'Literal';
const DECLARATOR = 'VariableDeclarator';
const STRING = 'string';
const EXCEPTION_FIT = 'An exception fits only when this is not a real secret.';
const FALLBACK_OPERATORS = new Set(['||', '??']);

function inStaticConcatenation(node) {
  const chain = [node];
  for (const current of chain) {
    if (isConcatenation(current.parent)) {
      chain.push(current.parent);
    }
  }
  return chain.length > 1 && staticString(chain.at(-1)) !== undefined;
}

function fallbackBranches(node) {
  if (node?.type === 'LogicalExpression' && FALLBACK_OPERATORS.has(node.operator)) {
    return [node.left, node.right];
  }
  return node?.type === 'ConditionalExpression' ? [node.consequent, node.alternate] : [];
}

function candidateStrings(start) {
  const found = [];
  const pending = [start];
  for (const node of pending) {
    const branches = fallbackBranches(node);
    pending.push(...branches);
    const text = branches.length === 0 ? staticString(node) : undefined;
    if (text !== undefined) {
      found.push({ node, text });
    }
  }
  return found;
}

function keyText(key) {
  if (key.type === IDENTIFIER) {
    return key.name;
  }
  return key.type === LITERAL && typeof key.value === STRING ? key.value : undefined;
}

function targetName(node) {
  switch (node.type) {
    case DECLARATOR:
    case 'AssignmentPattern':
      return node[node.type === DECLARATOR ? 'id' : 'left'].name;
    case 'Property':
    case 'PropertyDefinition':
      return node.computed ? undefined : keyText(node.key);
    case 'AssignmentExpression':
      if (node.left.type !== MEMBER) {
        return node.left.name;
      }
      return node.left.computed ? undefined : keyText(node.left.property);
    default:
      return undefined;
  }
}

function valueOf(node) {
  if (node.type === DECLARATOR) {
    return node.init;
  }
  if (node.type === 'AssignmentPattern') {
    return node.right;
  }
  return node.type === 'AssignmentExpression' ? node.right : node.value;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep secrets out of source code and out of log calls' },
    schema: [],
    messages: {
      hardcoded: [
        "'{{name}}' is assigned a hardcoded secret.",
        'Read it from the environment in the composition root (`process.env.NAME`)',
        'or a secrets manager and pass it in.',
        EXCEPTION_FIT,
      ].join(' '),
      credentialShape: [
        'This string looks like a credential (access key, token or private key).',
        'Read it from the environment in the composition root or a secrets manager.',
        EXCEPTION_FIT,
      ].join(' '),
      logged: [
        "'{{name}}' is a secret and must not be logged.",
        'Log that it is set, or a masked tail, instead.',
        EXCEPTION_FIT,
      ].join(' '),
    },
  },
  create(context) {
    function checkAssignment(node) {
      const name = targetName(node);
      if (name === undefined || !isSecretName(name)) {
        return;
      }
      for (const { node: literal, text } of candidateStrings(valueOf(node))) {
        if (isHardcodedSecret(text, name)) {
          context.report({ node: literal, messageId: 'hardcoded', data: { name } });
        }
      }
    }
    function checkShape(node) {
      const text = staticString(node);
      if (text !== undefined && !inStaticConcatenation(node) && hasCredentialShape(text)) {
        context.report({ node, messageId: 'credentialShape' });
      }
    }
    function checkSink(node) {
      for (const name of loggedSecretNames(node)) {
        context.report({ node, messageId: 'logged', data: { name } });
      }
    }
    return {
      VariableDeclarator: checkAssignment,
      AssignmentPattern: checkAssignment,
      Property: checkAssignment,
      PropertyDefinition: checkAssignment,
      AssignmentExpression: checkAssignment,
      Literal: checkShape,
      TemplateLiteral: checkShape,
      'BinaryExpression[operator="+"]': checkShape,
      CallExpression: checkSink,
      NewExpression: checkSink,
    };
  },
};
