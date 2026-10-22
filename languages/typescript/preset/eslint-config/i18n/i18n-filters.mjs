import { chainOf } from '../../../../../shared/traversal.mjs';

const SYMBOL_ENTITIES = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
};
const ENTITY = /&(?:#(?<decimal>\d+)|#x(?<hexadecimal>[\da-f]+)|(?<name>[a-z][a-z\d]*));/giu;
const LETTER = /\p{L}/u;
const SPACELESS_SCRIPTS = [
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Thai',
  'Lao',
  'Khmer',
  'Myanmar',
];
const SPACELESS_SCRIPT = new RegExp(
  `[${SPACELESS_SCRIPTS.map((script) => `\\p{Script=${script}}`).join('')}]`,
  'u',
);
const MAX_CODE_POINT = 0x10ffff;

function decodeEntity(match, { decimal, hexadecimal, name }) {
  if (name !== undefined) {
    return SYMBOL_ENTITIES[name.toLowerCase()] ?? match;
  }
  const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
  return codePoint > MAX_CODE_POINT ? match : String.fromCodePoint(codePoint);
}

function decodeEntities(text) {
  return text.replaceAll(ENTITY, (match, ...captures) => decodeEntity(match, captures.at(-1)));
}

function textOf(node, sourceCode) {
  const target = node.type === 'JSXAttribute' ? node.value : node;
  if (target === null) {
    return '';
  }
  if (target.type === 'TemplateLiteral') {
    return target.quasis.map(({ value }) => value.cooked ?? '').join('');
  }
  return typeof target.value === 'string' ? target.value : sourceCode.getText(target);
}

function ancestorOfType(node, types) {
  return chainOf(node, (current) => current.parent).find(({ type }) => types.includes(type));
}

function propertyNamed(object, name) {
  return object.properties.find(
    (property) =>
      property.type === 'Property' &&
      (property.key.name ?? property.key.value) === name &&
      !property.computed,
  );
}

export function dropParseErrors() {
  return (descriptor) => (descriptor.messageId === 'parseError' ? undefined : descriptor);
}

export function dropTextWithoutLetters(context) {
  return (descriptor) =>
    LETTER.test(decodeEntities(textOf(descriptor.node, context.sourceCode)))
      ? descriptor
      : undefined;
}

export function dropStaticJsxValues() {
  return (descriptor) => {
    const element = ancestorOfType(descriptor.node, ['JSXOpeningElement']);
    const values = element?.attributes.find(
      (attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'values',
    );
    const expression = values?.value?.expression;
    const isDynamic = expression !== undefined && expression.type !== 'ObjectExpression';
    return descriptor.messageId === 'missingValue' && isDynamic ? undefined : descriptor;
  };
}

export function dropTagIgnoringCalls() {
  return (descriptor) => {
    const call = ancestorOfType(descriptor.node, ['CallExpression', 'JSXOpeningElement']);
    const options = call?.type === 'CallExpression' ? call.arguments[2] : undefined;
    const ignoreTag =
      options?.type === 'ObjectExpression' ? propertyNamed(options, 'ignoreTag') : undefined;
    return ignoreTag?.value.value === true ? undefined : descriptor;
  };
}

export function dropSpacelessScriptMessages(context) {
  return (descriptor) => {
    const isAdjacency = descriptor.messageId === 'placeholderAdjacentToWord';
    const spaceless = SPACELESS_SCRIPT.test(textOf(descriptor.node, context.sourceCode));
    return isAdjacency && spaceless ? undefined : descriptor;
  };
}

export function reportOncePerNode() {
  const reported = new Set();
  return (descriptor) => {
    const key = descriptor.node ?? JSON.stringify(descriptor.loc);
    if (reported.has(key)) {
      return undefined;
    }
    reported.add(key);
    return descriptor;
  };
}
