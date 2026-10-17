import { isConcatenation } from '../analysis/static-shapes.mjs';
import { isLogCall } from '../support/error-flow.mjs';
import { joinedWords } from '../support/identifier-words.mjs';
import { hasCredentialShape, isSecretAssignment, staticString } from './secret-values.mjs';

const IDENTIFIER = 'Identifier';
const MEMBER = 'MemberExpression';
const LITERAL = 'Literal';
const DECLARATOR = 'VariableDeclarator';
const STRING = 'string';
const EXCEPTION_ROUTE =
  'If this is not a real secret, add an exception for nitpicker/no-hardcoded-secret in nitpicker.config.json.';
const SECRET_NAME = new RegExp(
  `(?:${[
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'secret',
    'token',
    'credentials?',
    'apikey',
    'privatekey',
    'accesskey',
    'secretkey',
    'authkey',
    'signingkey',
    'encryptionkey',
  ].join('|')})$`,
);
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

function isSecretName(name) {
  return SECRET_NAME.test(joinedWords(name).replaceAll(/\d/g, ''));
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

const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;
const STATUS_KEY = /^(?:has|is)[A-Z_]/;
const PASS_THROUGH = new Set([
  'SpreadElement',
  'TSAsExpression',
  'TSNonNullExpression',
  'ChainExpression',
]);

function ownNames(node) {
  if (node.type === IDENTIFIER) {
    return [node.name];
  }
  if (node.type === MEMBER && !node.computed) {
    return [keyText(node.property) ?? ''];
  }
  const direct = node.type === 'Property' && [IDENTIFIER, MEMBER].includes(node.value.type);
  const key = direct && !node.computed ? keyText(node.key) : undefined;
  return key === undefined || STATUS_KEY.test(key) ? [] : [key];
}

function loggedChildren(node) {
  if (Array.isArray(node)) {
    return node;
  }
  switch (node?.type) {
    case 'ObjectExpression':
      return node.properties;
    case 'Property':
      return [node.value];
    case 'TemplateLiteral':
      return node.expressions;
    case 'ArrayExpression':
      return node.elements;
    case 'LogicalExpression':
      return [node.left, node.right];
    case 'BinaryExpression':
      return node.operator === '+' ? [node.left, node.right] : [];
    default:
      return PASS_THROUGH.has(node?.type) ? [node.argument ?? node.expression] : [];
  }
}

function isNode(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function namesIn(start) {
  const names = [];
  const pending = [start];
  for (const node of pending) {
    if (isNode(node)) {
      names.push(...ownNames(node));
    }
    pending.push(...loggedChildren(node));
  }
  return names;
}

function loggedSecretNames(call) {
  return namesIn(call.arguments).filter((name) => isSecretName(name) && !CONSTANT_NAME.test(name));
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
        EXCEPTION_ROUTE,
      ].join(' '),
      credentialShape: [
        'This string looks like a credential (access key, token or private key).',
        'Read it from the environment in the composition root or a secrets manager.',
        EXCEPTION_ROUTE,
      ].join(' '),
      logged: [
        "'{{name}}' is a secret and must not be logged.",
        'Log that it is set, or a masked tail, instead.',
        EXCEPTION_ROUTE,
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
        if (isSecretAssignment(text, name)) {
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
    return {
      VariableDeclarator: checkAssignment,
      AssignmentPattern: checkAssignment,
      Property: checkAssignment,
      PropertyDefinition: checkAssignment,
      AssignmentExpression: checkAssignment,
      Literal: checkShape,
      TemplateLiteral: checkShape,
      'BinaryExpression[operator="+"]': checkShape,
      CallExpression(node) {
        if (!isLogCall(node)) {
          return;
        }
        for (const name of new Set(loggedSecretNames(node))) {
          context.report({ node, messageId: 'logged', data: { name } });
        }
      },
    };
  },
};
