import { ancestorsOf, chainOf } from '../../analysis/ancestry.mjs';
import { stringValue } from '../../analysis/constant-resolution.mjs';
import { propertyKeyName } from '../../analysis/test-code-analysis.mjs';
import { findColor, namedColor } from './color-text.mjs';

const CSS_TAG_ROOTS = new Set(['styled', 'css', 'keyframes', 'createGlobalStyle']);
const STYLE_CALL_ROOTS = new Set([...CSS_TAG_ROOTS, 'StyleSheet', 'makeStyles', 'createStyles']);
const STYLE_ATTRIBUTES = new Set(['style', 'sx', 'css']);
const COLOR_PROPERTIES = new Set([
  'color',
  'backgroundColor',
  'background',
  'borderColor',
  'fill',
  'stroke',
  'outlineColor',
  'textDecorationColor',
  'caretColor',
]);
const NON_COLOR_ATTRIBUTES = /^(?:href|to|id|htmlFor|xlinkHref|src|name|key|aria-.*)$/u;
const STYLE_TYPE_NAMES = [
  'CSSProperties',
  'CSSObject',
  'CSSInterpolation',
  'StyleProp',
  'ViewStyle',
  'TextStyle',
  'ImageStyle',
  'SxProps',
  'SystemStyleObject',
  'CSS\\.Properties',
];
const STYLE_TYPE = new RegExp(`\\b(?:${STYLE_TYPE_NAMES.join('|')})\\b`, 'u');
const PASS_THROUGH = new Set([
  'ConditionalExpression',
  'LogicalExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'JSXExpressionContainer',
]);
const NOT_A_VALUE_PARENT = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
  'TSLiteralType',
]);

function rootName(node) {
  const root = chainOf(node, (current) => {
    if (current.type === 'MemberExpression') return current.object;
    return current.type === 'CallExpression' ? current.callee : undefined;
  }).at(-1);
  return root.type === 'Identifier' ? root.name : undefined;
}

function camelCase(name) {
  return name?.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function isStyleType(sourceCode, annotation) {
  return annotation !== undefined && STYLE_TYPE.test(sourceCode.getText(annotation));
}

function styleVerdict(sourceCode, parent, child) {
  switch (parent.type) {
    case 'Property':
      return parent.value === child ? 'pass' : 'no';
    case 'ObjectExpression':
    case 'ArrayExpression':
    case 'SpreadElement':
    case 'JSXExpressionContainer':
    case 'ConditionalExpression':
    case 'LogicalExpression':
      return 'pass';
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
      return isStyleType(sourceCode, parent.typeAnnotation) ? 'yes' : 'pass';
    case 'JSXAttribute':
      return STYLE_ATTRIBUTES.has(parent.name.name) ? 'yes' : 'no';
    case 'CallExpression':
      return parent.arguments.includes(child) && STYLE_CALL_ROOTS.has(rootName(parent.callee))
        ? 'yes'
        : 'no';
    case 'VariableDeclarator':
      return isStyleType(sourceCode, parent.id.typeAnnotation) ? 'yes' : 'no';
    default:
      return 'no';
  }
}

function isStyleObject(sourceCode, object) {
  let child = object;
  for (const parent of ancestorsOf(object)) {
    const verdict = styleVerdict(sourceCode, parent, child);
    if (verdict !== 'pass') return verdict === 'yes';
    child = parent;
  }
  return false;
}

function valueOwner(node) {
  const start = node.type === 'TemplateElement' ? node.parent : node;
  let child = start;
  for (const parent of ancestorsOf(start)) {
    if (!PASS_THROUGH.has(parent.type)) return { owner: parent, child };
    child = parent;
  }
  return { owner: undefined, child };
}

function positionOf(sourceCode, node) {
  const { owner, child } = valueOwner(node);
  if (owner?.type === 'JSXAttribute') {
    const name = owner.name.name;
    return {
      colorPosition: COLOR_PROPERTIES.has(name),
      colorAttribute: COLOR_PROPERTIES.has(name),
      style: STYLE_ATTRIBUTES.has(name),
      skipped: NON_COLOR_ATTRIBUTES.test(name ?? ''),
    };
  }
  if (owner?.type === 'Property') {
    const colorKey =
      owner.value === child && COLOR_PROPERTIES.has(camelCase(propertyKeyName(owner)));
    return {
      colorPosition: colorKey,
      colorAttribute: false,
      style: owner.value === child && isStyleObject(sourceCode, owner.parent),
      skipped: owner.key === child && !owner.computed,
    };
  }
  return {
    colorPosition: false,
    colorAttribute: false,
    style: false,
    skipped: owner !== undefined && NOT_A_VALUE_PARENT.has(owner.type),
  };
}

function isCssTemplate(node) {
  if (node.type !== 'TemplateElement') return false;
  const template = node.parent;
  const { parent } = template;
  return (
    parent.type === 'TaggedTemplateExpression' &&
    parent.quasi === template &&
    CSS_TAG_ROOTS.has(rootName(parent.tag))
  );
}

function namedColorAllowed(position) {
  return position.colorAttribute || (position.colorPosition && position.style);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Take colors from the theme or palette, not from literals' },
    schema: [],
    messages: {
      hardcodedColor:
        'Take the color from the theme or design-system palette (a theme token, a CSS variable, or currentColor) instead of the literal {{color}}. A file that defines the palette, or a theme or palette folder, takes one glob exception (for example `src/theme/**`).',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(node, text, whole) {
      const position = positionOf(sourceCode, node);
      if (position.skipped) return;
      const color =
        findColor(text, { whole, css: isCssTemplate(node), ...position }) ??
        (whole && namedColorAllowed(position) ? namedColor(text) : undefined);
      if (color !== undefined) {
        context.report({ node, messageId: 'hardcodedColor', data: { color } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value, true);
      },
      TemplateElement(node) {
        const template = node.parent;
        check(
          node,
          stringValue(template) ?? node.value.cooked ?? node.value.raw,
          template.quasis.length === 1,
        );
      },
    };
  },
};
