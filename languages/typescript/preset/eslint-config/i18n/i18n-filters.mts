import type { Rule } from 'eslint';
import type { TSESTree } from '@typescript-eslint/utils';
import { hasKind } from '../../syntax/kinds/node-kinds.mts';
import { chainOf as untypedChainOf } from '../../../../../shared/traversal.mts';
import { fieldOf, optionalText } from '../../../../../shared/values/readers.mts';

type Descriptor = Rule.ReportDescriptor & { readonly messageId?: string };
type Filter = (descriptor: Descriptor) => Descriptor | undefined;
type Groups = {
  decimal?: string | undefined;
  hexadecimal?: string | undefined;
  name?: string | undefined;
};

const chainOf: (
  start: TSESTree.Node,
  next: (current: TSESTree.Node) => TSESTree.Node | undefined,
) => TSESTree.Node[] = untypedChainOf;

const JSX_ATTRIBUTE = 'JSXAttribute';
const HEXADECIMAL_RADIX = 16;
const DECIMAL_RADIX = 10;

const SYMBOL_ENTITIES: Readonly<Record<string, string>> = {
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

function decodeEntity(match: string, { decimal, hexadecimal, name }: Groups): string {
  if (name !== undefined) {
    return SYMBOL_ENTITIES[name.toLowerCase()] ?? match;
  }
  const codePoint = Number.parseInt(
    decimal ?? hexadecimal ?? '',
    decimal === undefined ? HEXADECIMAL_RADIX : DECIMAL_RADIX,
  );
  return codePoint > MAX_CODE_POINT ? match : String.fromCodePoint(codePoint);
}

function groupsOf(captures: readonly unknown[]): Groups {
  const groups = captures.at(-1);
  return {
    decimal: optionalText(fieldOf(groups, 'decimal')),
    hexadecimal: optionalText(fieldOf(groups, 'hexadecimal')),
    name: optionalText(fieldOf(groups, 'name')),
  };
}

function decodeEntities(text: string): string {
  return text.replaceAll(ENTITY, (match, ...captures: unknown[]) =>
    decodeEntity(match, groupsOf(captures)),
  );
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof fieldOf(value, 'type') === 'string';
}

function nodeOf(descriptor: Descriptor): TSESTree.Node | undefined {
  const node: unknown = 'node' in descriptor ? descriptor.node : undefined;
  return isNode(node) ? node : undefined;
}

function textOf(
  node: TSESTree.Node | undefined,
  sourceCode: Rule.RuleContext['sourceCode'],
): string {
  const target = hasKind(node, JSX_ATTRIBUTE) ? node.value : node;
  if (target === null || target === undefined) {
    return '';
  }
  if (hasKind(target, 'TemplateLiteral')) {
    return target.quasis.map(({ value }) => value.cooked).join('');
  }
  return 'value' in target && typeof target.value === 'string'
    ? target.value
    : sourceCode.text.slice(target.range[0], target.range[1]);
}

function isOpeningElement(node: TSESTree.Node): node is TSESTree.JSXOpeningElement {
  return hasKind(node, 'JSXOpeningElement');
}

function isCallOrOpeningElement(
  node: TSESTree.Node,
): node is TSESTree.CallExpression | TSESTree.JSXOpeningElement {
  return hasKind(node, 'CallExpression') || isOpeningElement(node);
}

function ancestorOfType<Found extends TSESTree.Node>(
  node: TSESTree.Node | undefined,
  matches: (candidate: TSESTree.Node) => candidate is Found,
): Found | undefined {
  return node === undefined ? undefined : chainOf(node, (current) => current.parent).find(matches);
}

function keyName(key: TSESTree.Property['key']): unknown {
  if ('name' in key) {
    return key.name;
  }
  return 'value' in key ? key.value : undefined;
}

function propertyNamed(
  object: TSESTree.ObjectExpression,
  name: string,
): TSESTree.Property | undefined {
  return object.properties.find(
    (property): property is TSESTree.Property =>
      hasKind(property, 'Property') && keyName(property.key) === name && !property.computed,
  );
}

export function dropParseErrors(): Filter {
  return (descriptor) => (descriptor.messageId === 'parseError' ? undefined : descriptor);
}

export function dropTextWithoutLetters(context: Rule.RuleContext): Filter {
  return (descriptor) =>
    LETTER.test(decodeEntities(textOf(nodeOf(descriptor), context.sourceCode)))
      ? descriptor
      : undefined;
}

export function dropStaticJsxValues(): Filter {
  return (descriptor) => {
    const element = ancestorOfType(nodeOf(descriptor), isOpeningElement);
    const values = element?.attributes.find(
      (attribute) =>
        hasKind(attribute, JSX_ATTRIBUTE) &&
        hasKind(attribute.name, 'JSXIdentifier') &&
        attribute.name.name === 'values',
    );
    const value = hasKind(values, JSX_ATTRIBUTE) ? values.value : undefined;
    const expression = hasKind(value, 'JSXExpressionContainer') ? value.expression : undefined;
    const isDynamic = expression !== undefined && !hasKind(expression, 'ObjectExpression');
    return descriptor.messageId === 'missingValue' && isDynamic ? undefined : descriptor;
  };
}

export function dropTagIgnoringCalls(): Filter {
  return (descriptor) => {
    const call = ancestorOfType(nodeOf(descriptor), isCallOrOpeningElement);
    const options = hasKind(call, 'CallExpression') ? call.arguments[2] : undefined;
    const ignoreTag = hasKind(options, 'ObjectExpression')
      ? propertyNamed(options, 'ignoreTag')
      : undefined;
    const ignored = ignoreTag?.value;
    return hasKind(ignored, 'Literal') && ignored.value === true ? undefined : descriptor;
  };
}

export function dropSpacelessScriptMessages(context: Rule.RuleContext): Filter {
  return (descriptor) => {
    const isAdjacency = descriptor.messageId === 'placeholderAdjacentToWord';
    const spaceless = SPACELESS_SCRIPT.test(textOf(nodeOf(descriptor), context.sourceCode));
    return isAdjacency && spaceless ? undefined : descriptor;
  };
}

export function reportOncePerNode(): Filter {
  const reported = new Set<unknown>();
  return (descriptor) => {
    const key =
      ('node' in descriptor ? descriptor.node : undefined) ??
      JSON.stringify('loc' in descriptor ? descriptor.loc : undefined);
    if (reported.has(key)) {
      return undefined;
    }
    reported.add(key);
    return descriptor;
  };
}
