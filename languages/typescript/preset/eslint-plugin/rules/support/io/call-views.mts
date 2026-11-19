import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { hasTextReceiver } from './names/text-receivers.mts';
import {
  chainLinks,
  deepKeys,
  SPREAD,
  TEXT_KEYS,
  viewOf,
  type CallArgument,
  type CallView,
  type Child,
  type LiteralArgument,
  type Step,
} from './views/call-shapes.mts';

export type { CallArgument, CallView } from './views/call-shapes.mts';
export { tsCallee, tsCallView, type TsCall } from './views/ts-call-views.mts';

const OWNER_OFFSET = 2;

export function ownerName(view: Pick<CallView, 'names'>): string | undefined {
  return view.names.at(-OWNER_OFFSET);
}

export type EstreeCall =
  TSESTree.CallExpression | TSESTree.NewExpression | TSESTree.TaggedTemplateExpression;

const ESTREE_FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
]);

function wrapped(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression
    ? node.expression
    : undefined;
}

function estreeStep(node: TSESTree.Node): Step<TSESTree.Node, TSESTree.Identifier> {
  const inner = wrapped(node);
  if (inner !== undefined) {
    return { next: inner };
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return { name: node.computed ? '[]' : node.property.name, next: node.object };
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return { next: node.callee, called: true };
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return { name: node.name, root: node };
  }
  return node.type === AST_NODE_TYPES.ThisExpression ? { name: 'this' } : {};
}

function estreeChildren(node: TSESTree.Node): Child<TSESTree.Node>[] {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.map((element) => ({ value: element ?? undefined }));
  }
  return node.type === AST_NODE_TYPES.ObjectExpression
    ? node.properties.map((property) => ({
        key:
          property.type === AST_NODE_TYPES.Property && !property.computed
            ? nameOf(property.key)
            : SPREAD,
        value: property.type === AST_NODE_TYPES.Property ? property.value : undefined,
      }))
    : [];
}

function estreeText(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return node.type === AST_NODE_TYPES.TemplateLiteral
    ? node.quasis.map((quasi) => quasi.value.raw).join('?')
    : undefined;
}

function isTextProperty(property: TSESTree.Node): property is TSESTree.Property {
  const name = property.type === AST_NODE_TYPES.Property ? nameOf(property.key) : undefined;
  return name !== undefined && TEXT_KEYS.has(name);
}

function estreeLiteral(node: TSESTree.Node): LiteralArgument {
  const text = estreeText(node);
  if (text !== undefined) {
    return { type: 'text', text };
  }
  if (ESTREE_FUNCTIONS.has(node.type)) {
    return { type: 'function' };
  }
  if (node.type === AST_NODE_TYPES.Literal && 'regex' in node) {
    return { type: 'pattern' };
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    const statement = node.properties.find(isTextProperty);
    const statementText = statement === undefined ? undefined : estreeText(statement.value);
    return { type: 'object', keys: deepKeys(node, estreeChildren), text: statementText };
  }
  return node.type === AST_NODE_TYPES.ArrayExpression
    ? { type: 'object', keys: deepKeys(node, estreeChildren) }
    : { type: 'other' };
}

function estreeArgument(
  argument: TSESTree.CallExpressionArgument,
  context: SourceContext | undefined,
): CallArgument {
  const node = context === undefined ? argument : (resolveConstant(context, argument) ?? argument);
  if (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier
  ) {
    const [input] = node.arguments;
    return {
      type: 'new',
      name: node.callee.name,
      input: input === undefined ? undefined : estreeLiteral(input),
    };
  }
  return estreeLiteral(node);
}

export function estreeCallView(
  call: EstreeCall,
  context: SourceContext | undefined,
): CallView<TSESTree.Identifier> {
  const tagged = call.type === AST_NODE_TYPES.TaggedTemplateExpression;
  const chain = chainLinks(tagged ? call.tag : call.callee, estreeStep);
  const args = tagged
    ? [estreeLiteral(call.quasi)]
    : call.arguments.map((argument) => estreeArgument(argument, context));
  return viewOf(chain, args, hasTextReceiver(call));
}
