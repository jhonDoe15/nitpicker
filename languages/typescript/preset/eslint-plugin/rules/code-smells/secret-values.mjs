import { isConcatenation } from '../analysis/static-shapes.mjs';
import { joinedWords } from '../support/identifier-words.mjs';

const TOKEN_SHAPES = [
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}/,
  /\bsk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}/,
];
const EMBEDDED_SECRETS = [
  /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]+)@/i,
  /^(?:Bearer|Basic|Token)\s+(\S+)$/,
  /[?&;]password=([^&;\s]+)/i,
];
const PLACEHOLDER = new RegExp(
  `^(?:${[
    '\\*+',
    'x+',
    '<.*>',
    '\\[.*\\]',
    '\\$\\{.*\\}',
    '\\{\\{.*\\}\\}',
    '%s',
    ':\\w+',
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
const NAME_PATH = /^[A-Za-z]+(?:[._:/-][A-Za-z]+)+$/;
const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
const MINIMUM_LENGTH = 6;
const MIXED_CLASSES = 3;
const DECODERS = new Set(['atob', 'from', 'decode']);
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);

function looksLikeSecretValue(text) {
  if (text.length < MINIMUM_LENGTH || /\s/.test(text) || PLACEHOLDER.test(text)) {
    return false;
  }
  if (ENVIRONMENT_NAME.test(text) || NAME_PATH.test(text)) {
    return false;
  }
  const classes = CHARACTER_CLASSES.filter((pattern) => pattern.test(text)).length;
  return (/\d/.test(text) && /[A-Za-z]/.test(text)) || classes >= MIXED_CLASSES;
}

export function hasCredentialShape(text) {
  if (TOKEN_SHAPES.some((shape) => shape.test(text))) {
    return true;
  }
  return EMBEDDED_SECRETS.some((shape) => {
    const secret = shape.exec(text)?.[1];
    return secret !== undefined && looksLikeSecretValue(secret);
  });
}

export function isSecretAssignment(text, name) {
  if (hasCredentialShape(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return false;
  }
  return looksLikeSecretValue(text) && joinedWords(text) !== joinedWords(name);
}

function literalText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked ?? '';
  }
  return undefined;
}

function concatenationLeaves(start) {
  const leaves = [];
  const pending = [start];
  for (const node of pending) {
    if (isConcatenation(node)) {
      pending.push(node.left, node.right);
    } else {
      leaves.push(node);
    }
  }
  return leaves.sort((a, b) => a.range[0] - b.range[0]);
}

function unwrapped(start) {
  const chain = [start];
  for (const node of chain) {
    if (WRAPPERS.has(node?.type)) {
      chain.push(node.expression);
    }
    const callee = node?.type === 'CallExpression' ? node.callee : undefined;
    const name = callee?.type === 'MemberExpression' ? callee.property.name : callee?.name;
    if (DECODERS.has(name) && node.arguments.length > 0) {
      chain.push(node.arguments[0]);
    }
    if (name === 'toString' && callee.type === 'MemberExpression') {
      chain.push(callee.object);
    }
  }
  return chain.at(-1);
}

export function staticString(start) {
  const node = unwrapped(start);
  if (node?.type !== 'BinaryExpression') {
    return literalText(node);
  }
  const parts = concatenationLeaves(node).map((leaf) => literalText(unwrapped(leaf)));
  return parts.includes(undefined) ? undefined : parts.join('');
}
