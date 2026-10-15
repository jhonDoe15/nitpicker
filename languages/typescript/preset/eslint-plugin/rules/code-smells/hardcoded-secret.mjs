import { isLogCall } from '../support/error-flow.mjs';
import { joinedWords } from '../support/identifier-words.mjs';

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
const SECRET_SHAPES = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\bsk[-_](?:live|test|proj)?[-_]?[A-Za-z0-9_-]{16,}/,
];
const PLACEHOLDER = new RegExp(
  `^(?:${[
    '\\*+',
    'x+',
    '<.*>',
    '\\[.*\\]',
    '\\$\\{.*\\}',
    '\\{\\{.*\\}\\}',
    'changeme',
    'change-me',
    'todo',
    'example',
    'dummy',
    'placeholder',
    'redacted',
    'none',
    'null',
    'undefined',
    'your[-_ ].*',
  ].join('|')})$`,
  'i',
);
const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]+$/;
const WORDS_WITH_SEPARATORS = /^[a-z]+(?:[_.:/-][a-z]+)+$/;
const MINIMUM_LENGTH = 6;
const FALLBACK_OPERATORS = new Set(['||', '??']);

function isSecretName(name) {
  return SECRET_NAME.test(joinedWords(name));
}

function stringOf(node) {
  if (node?.type === LITERAL && typeof node.value === STRING) return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? '';
  }
  return undefined;
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
    const text = branches.length === 0 ? stringOf(node) : undefined;
    if (text !== undefined) found.push({ node, text });
  }
  return found;
}

function looksSecret(text, name) {
  if (SECRET_SHAPES.some((shape) => shape.test(text))) return false;
  if (text.length < MINIMUM_LENGTH || /\s/.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return false;
  }
  if (PLACEHOLDER.test(text) || ENVIRONMENT_NAME.test(text) || WORDS_WITH_SEPARATORS.test(text)) {
    return false;
  }
  return joinedWords(text) !== joinedWords(name);
}

function keyText(key) {
  if (key.type === IDENTIFIER) return key.name;
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
      return node.left.type === MEMBER ? keyText(node.left.property) : node.left.name;
    default:
      return undefined;
  }
}

function valueOf(node) {
  if (node.type === DECLARATOR) return node.init;
  if (node.type === 'AssignmentPattern') return node.right;
  return node.type === 'AssignmentExpression' ? node.right : node.value;
}

const LOGGED_CHILDREN = [
  'arguments',
  'properties',
  'expressions',
  'elements',
  'argument',
  'left',
  'right',
  'object',
  'value',
];

function ownNames(node) {
  if (node.type === IDENTIFIER) return [node.name];
  if (node.type === MEMBER && !node.computed) return [keyText(node.property) ?? ''];
  if (node.type === 'Property' && !node.computed && node.value.type !== LITERAL) {
    return [keyText(node.key) ?? ''];
  }
  return [];
}

function isNode(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loggedChildren(node) {
  if (Array.isArray(node)) return node;
  return isNode(node) && node.type !== 'CallExpression'
    ? LOGGED_CHILDREN.map((key) => node[key])
    : [];
}

function namesIn(start) {
  const names = [];
  const pending = [start];
  for (const node of pending) {
    if (isNode(node)) names.push(...ownNames(node));
    pending.push(...loggedChildren(node));
  }
  return names;
}

function loggedSecretNames(call) {
  return namesIn(call.arguments).filter(isSecretName);
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
      if (name === undefined || !isSecretName(name)) return;
      for (const { node: literal, text } of candidateStrings(valueOf(node))) {
        if (looksSecret(text, name)) {
          context.report({ node: literal, messageId: 'hardcoded', data: { name } });
        }
      }
    }
    function checkShape(node) {
      const text = node.value;
      const matches = typeof text === STRING && SECRET_SHAPES.some((shape) => shape.test(text));
      if (matches) context.report({ node, messageId: 'credentialShape' });
    }
    return {
      VariableDeclarator: checkAssignment,
      AssignmentPattern: checkAssignment,
      Property: checkAssignment,
      PropertyDefinition: checkAssignment,
      AssignmentExpression: checkAssignment,
      Literal: checkShape,
      CallExpression(node) {
        if (!isLogCall(node)) return;
        for (const name of new Set(loggedSecretNames(node))) {
          context.report({ node, messageId: 'logged', data: { name } });
        }
      },
    };
  },
};
