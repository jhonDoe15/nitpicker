import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, chainOf, nameOf, type SourceCode } from '../../typed/node-views.mts';
import { stringValue } from '../../analysis/constant-resolution.mts';
import { propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { findColor, namedColor } from './color-text.mts';

type Verdict = 'pass' | 'yes' | 'no';
type Position = {
  readonly colorPosition: boolean;
  readonly colorAttribute: boolean;
  readonly style: boolean;
  readonly skipped: boolean;
};
type TextNode = TSESTree.Literal | TSESTree.TemplateElement;

const CSS_TAG_ROOTS = new Set<string | undefined>([
  'styled',
  'css',
  'keyframes',
  'createGlobalStyle',
]);
const STYLE_CALL_ROOTS = new Set<string | undefined>([
  ...CSS_TAG_ROOTS,
  'StyleSheet',
  'makeStyles',
  'createStyles',
]);
const STYLE_ATTRIBUTES = new Set<string | undefined>(['style', 'sx', 'css']);
const COLOR_PROPERTIES = new Set<string | undefined>([
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
const STYLE_PASS_PARENTS = new Set<string>([
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.JSXExpressionContainer,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);
const NOT_A_VALUE_PARENT = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
  'TSLiteralType',
]);

function rootName(node: TSESTree.Node): string | undefined {
  const root = chainOf(node, (current) => {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      return current.object;
    }
    return current.type === AST_NODE_TYPES.CallExpression ? current.callee : undefined;
  }).at(-1);
  return root?.type === AST_NODE_TYPES.Identifier ? root.name : undefined;
}

function camelCase(name: string | undefined): string | undefined {
  return name?.replace(/-([a-z])/gu, (_match: string, letter: string) => letter.toUpperCase());
}

function isStyleType(sourceCode: SourceCode, annotation: TSESTree.Node | undefined): boolean {
  return annotation !== undefined && STYLE_TYPE.test(sourceCode.getText(annotation));
}

function styleVerdict(
  sourceCode: SourceCode,
  parent: TSESTree.Node,
  child: TSESTree.Node,
): Verdict {
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === child ? 'pass' : 'no';
  }
  return STYLE_PASS_PARENTS.has(parent.type) ? 'pass' : ownerVerdict(sourceCode, parent, child);
}

function ownerVerdict(
  sourceCode: SourceCode,
  parent: TSESTree.Node,
  child: TSESTree.Node,
): Verdict {
  if (
    parent.type === AST_NODE_TYPES.TSAsExpression ||
    parent.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    return isStyleType(sourceCode, parent.typeAnnotation) ? 'yes' : 'pass';
  }
  if (parent.type === AST_NODE_TYPES.JSXAttribute) {
    return STYLE_ATTRIBUTES.has(nameOf(parent.name)) ? 'yes' : 'no';
  }
  if (parent.type === AST_NODE_TYPES.CallExpression) {
    return parent.arguments.some((argument) => argument === child) &&
      STYLE_CALL_ROOTS.has(rootName(parent.callee))
      ? 'yes'
      : 'no';
  }
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    return isStyleType(sourceCode, parent.id.typeAnnotation) ? 'yes' : 'no';
  }
  return 'no';
}

function isStyleObject(sourceCode: SourceCode, object: TSESTree.Node): boolean {
  let child = object;
  for (const parent of ancestorsOf(object)) {
    const verdict = styleVerdict(sourceCode, parent, child);
    if (verdict !== 'pass') {
      return verdict === 'yes';
    }
    child = parent;
  }
  return false;
}

function valueOwner(node: TSESTree.Node): {
  readonly owner: TSESTree.Node | undefined;
  readonly child: TSESTree.Node;
} {
  const start = node.type === AST_NODE_TYPES.TemplateElement ? node.parent : node;
  let child: TSESTree.Node = start;
  for (const parent of ancestorsOf(start)) {
    if (!PASS_THROUGH.has(parent.type)) {
      return { owner: parent, child };
    }
    child = parent;
  }
  return { owner: undefined, child };
}

function positionOf(sourceCode: SourceCode, node: TSESTree.Node): Position {
  const { owner, child } = valueOwner(node);
  if (owner?.type === AST_NODE_TYPES.JSXAttribute) {
    const name = nameOf(owner.name);
    return {
      colorPosition: COLOR_PROPERTIES.has(name),
      colorAttribute: COLOR_PROPERTIES.has(name),
      style: STYLE_ATTRIBUTES.has(name),
      skipped: NON_COLOR_ATTRIBUTES.test(name ?? ''),
    };
  }
  if (owner?.type === AST_NODE_TYPES.Property) {
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

function isCssTemplate(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.TemplateElement) {
    return false;
  }
  const template = node.parent;
  const { parent } = template;
  return (
    parent.type === AST_NODE_TYPES.TaggedTemplateExpression &&
    parent.quasi === template &&
    CSS_TAG_ROOTS.has(rootName(parent.tag))
  );
}

function namedColorAllowed(position: Position): boolean {
  return position.colorAttribute || (position.colorPosition && position.style);
}

export const rule: TSESLint.RuleModule<'hardcodedColor'> = {
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

    function check(node: TextNode, text: string, whole: boolean): void {
      const position = positionOf(sourceCode, node);
      if (position.skipped) {
        return;
      }
      const color =
        findColor(text, { whole, css: isCssTemplate(node), ...position }) ??
        (whole && namedColorAllowed(position) ? namedColor(text) : undefined);
      if (color !== undefined) {
        context.report({ node, messageId: 'hardcodedColor', data: { color } });
      }
    }

    return {
      Literal(node: TSESTree.Literal) {
        if (typeof node.value === 'string') {
          check(node, node.value, true);
        }
      },
      TemplateElement(node: TSESTree.TemplateElement) {
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
