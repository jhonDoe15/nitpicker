import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf } from '../../typed/node-views.mts';
import { ASSERTION_FORMS, unwrapOf } from '../../typed/syntax-views.mts';

export type Sink = { readonly value: TSESTree.Node };

const ANCHOR_ELEMENTS = new Set(['a', 'area']);
const EMBED_ELEMENTS = new Set(['iframe', 'embed', 'object', 'frame']);
const FORM_ELEMENTS = new Set(['form', 'button', 'input']);
const LINK_COMPONENT = /(?:Link|Anchor)$/u;
const NAVIGATION_METHODS = new Set(['assign', 'replace']);

function elementName(node: TSESTree.JSXOpeningElement): string {
  return node.name.type === AST_NODE_TYPES.JSXIdentifier ? node.name.name : '';
}

function isLocation(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, ASSERTION_FORMS);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return value.name === 'location';
  }
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    nameOf(value.property) === 'location' &&
    nameOf(value.object) === 'window'
  );
}

export function attributeSink(node: TSESTree.JSXAttribute): Sink | undefined {
  const element = node.parent.type === AST_NODE_TYPES.JSXOpeningElement ? node.parent : undefined;
  const name = node.name.type === AST_NODE_TYPES.JSXIdentifier ? node.name.name : '';
  const tag = element === undefined ? '' : elementName(element);
  const value =
    node.value?.type === AST_NODE_TYPES.JSXExpressionContainer ? node.value.expression : undefined;
  const matches =
    (name === 'href' && (ANCHOR_ELEMENTS.has(tag) || LINK_COMPONENT.test(tag))) ||
    (name === 'src' && EMBED_ELEMENTS.has(tag)) ||
    ((name === 'action' || name === 'formAction') && FORM_ELEMENTS.has(tag));
  return matches && value !== undefined && value.type !== AST_NODE_TYPES.JSXEmptyExpression
    ? { value }
    : undefined;
}

export function callSink(node: TSESTree.CallExpression): Sink | undefined {
  const { callee } = node;
  const [argument] = node.arguments;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    argument === undefined
  ) {
    return undefined;
  }
  const method = nameOf(callee.property) ?? '';
  const opensWindow =
    method === 'open' && isLocation(callee.object) === false && nameOf(callee.object) === 'window';
  const navigates = NAVIGATION_METHODS.has(method) && isLocation(callee.object);
  return (opensWindow || navigates) && argument.type !== AST_NODE_TYPES.SpreadElement
    ? { value: argument }
    : undefined;
}

export function assignmentSink(node: TSESTree.AssignmentExpression): Sink | undefined {
  const { left } = node;
  const toHref =
    left.type === AST_NODE_TYPES.MemberExpression &&
    !left.computed &&
    nameOf(left.property) === 'href' &&
    isLocation(left.object);
  return node.operator === '=' && (toHref || isLocation(left)) ? { value: node.right } : undefined;
}
