import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calleeName } from '../../analysis/node/call-text.mts';
import { chainOf } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapOf } from '../../typed/syntax-views.mts';

export type Use = 'state' | 'input' | 'fallback';

const STATE_HOOKS = new Set(['useState', 'useForm', 'useFormik', 'useReducer']);
const INPUT_ATTRIBUTES = new Set(['value', 'defaultValue', 'min', 'max']);
const PASS_THROUGH = new Set<string>([
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.ObjectExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSNonNullExpression,
]);
const DATE_NAME = /(?:^d|D)ate$/u;

function isDateNamed(node: TSESTree.Node): boolean {
  const name = calleeName(unwrapOf(node, [AST_NODE_TYPES.ChainExpression]));
  return name !== undefined && DATE_NAME.test(name);
}

function isDateInput(attribute: TSESTree.JSXAttribute): boolean {
  return (
    attribute.name.type === AST_NODE_TYPES.JSXIdentifier &&
    INPUT_ATTRIBUTES.has(attribute.name.name) &&
    attribute.parent.attributes.some(
      (other) =>
        other.type === AST_NODE_TYPES.JSXAttribute &&
        other.name.name === 'type' &&
        other.value?.type === AST_NODE_TYPES.Literal &&
        other.value.value === 'date',
    )
  );
}

function stateUse(node: TSESTree.Node, parent: TSESTree.Node): Use | undefined {
  return parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === node) &&
    STATE_HOOKS.has(calleeNameOf(parent.callee) ?? '')
    ? 'state'
    : undefined;
}

function inputUse(parent: TSESTree.Node): Use | undefined {
  if (parent.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return undefined;
  }
  const attribute = parent.parent;
  return attribute.type === AST_NODE_TYPES.JSXAttribute && isDateInput(attribute)
    ? 'input'
    : undefined;
}

function fallbackUse(node: TSESTree.Node, parent: TSESTree.Node): Use | undefined {
  return parent.type === AST_NODE_TYPES.LogicalExpression &&
    parent.right === node &&
    parent.operator !== '&&' &&
    isDateNamed(parent.left)
    ? 'fallback'
    : undefined;
}

function useAt(node: TSESTree.Node): Use | undefined {
  const { parent } = node;
  if (parent === undefined) {
    return undefined;
  }
  return stateUse(node, parent) ?? inputUse(parent) ?? fallbackUse(node, parent);
}

function isLazyInitializer(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  const call = parent.parent;
  return (
    parent.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    parent.body === node &&
    parent.params.length === 0 &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === parent &&
    calleeNameOf(call.callee) === 'useState'
  );
}

function passes(node: TSESTree.Node, parent: TSESTree.Node): boolean {
  if (PASS_THROUGH.has(parent.type)) {
    return true;
  }
  if (parent.type === AST_NODE_TYPES.Property) {
    return parent.value === node;
  }
  if (parent.type === AST_NODE_TYPES.LogicalExpression) {
    return parent.operator !== '&&';
  }
  return isLazyInitializer(node, parent);
}

function carrier(node: TSESTree.Node): TSESTree.Node | undefined {
  const { parent } = node;
  return parent !== undefined && useAt(node) === undefined && passes(node, parent)
    ? parent
    : undefined;
}

/** How the value of `node` is used as a calendar date a person sees or enters, if it is. */
export function dateUseOf(node: TSESTree.Node): Use | undefined {
  const reached = chainOf(node, carrier).at(-1);
  return reached === undefined ? undefined : useAt(reached);
}
