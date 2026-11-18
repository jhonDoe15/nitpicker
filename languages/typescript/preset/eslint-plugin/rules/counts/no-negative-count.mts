import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isLiteral } from '../typed/syntax-views.mts';
import { leaves, unwrap } from '../support/flow/guard-forms.mts';

type MessageId = 'negativeCount';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Subtraction = { readonly node: TSESTree.BinaryExpression; readonly name: string | undefined };

const RELATION = /[<>]/u;
const LARGEST = /max|largest|longest|lengths/iu;
const CLAMPING = new Set(['max', 'min', 'round', 'floor', 'ceil']);

function findSubtraction(node: TSESTree.Node): TSESTree.BinaryExpression | undefined {
  const value = unwrap(node);
  if (value.type !== AST_NODE_TYPES.BinaryExpression) {
    return undefined;
  }
  if (value.operator === '-') {
    return isLiteral(value.right) ? undefined : value;
  }
  return value.operator === '+'
    ? (findSubtraction(value.left) ?? findSubtraction(value.right))
    : undefined;
}

function resolve(context: Context, argument: TSESTree.Node): Subtraction | undefined {
  const direct = findSubtraction(argument);
  if (direct !== undefined) {
    return { node: direct, name: undefined };
  }
  const value = unwrap(argument);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = context.sourceCode
    .getScope(value)
    .references.find(({ identifier }) => identifier === value)?.resolved;
  const [definition] = variable?.defs ?? [];
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  if (
    variable?.defs.length !== 1 ||
    writes.length !== 1 ||
    definition?.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.node.init === null
  ) {
    return undefined;
  }
  const found = findSubtraction(definition.node.init);
  return found === undefined ? undefined : { node: found, name: value.name };
}

function isClamped(context: Context, node: TSESTree.Node): boolean {
  const value = unwrap(node);
  if (value.type === AST_NODE_TYPES.Identifier) {
    const [definition] = context.sourceCode.getScope(value).set.get(value.name)?.defs ?? [];
    const init =
      definition?.node.type === AST_NODE_TYPES.VariableDeclarator && definition.node.init;
    return init ? isClamped(context, init) : false;
  }
  return (
    value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    value.callee.object.type === AST_NODE_TYPES.Identifier &&
    value.callee.object.name === 'Math' &&
    value.callee.property.type === AST_NODE_TYPES.Identifier &&
    CLAMPING.has(value.callee.property.name)
  );
}

function isComputedLimit(context: Context, { left, right }: TSESTree.BinaryExpression): boolean {
  return (
    LARGEST.test(context.sourceCode.getText(left)) ||
    isClamped(context, left) ||
    isClamped(context, right)
  );
}

function guards(testText: string, { node, name }: Subtraction, context: Context): boolean {
  if (!RELATION.test(testText)) {
    return false;
  }
  const { sourceCode } = context;
  const left = sourceCode.getText(node.left);
  const right = sourceCode.getText(node.right);
  const both = testText.includes(left) && testText.includes(right);
  const named = name !== undefined && new RegExp(`\\b${name}\\b`, 'u').test(testText);
  return both || named || testText.includes(sourceCode.getText(node));
}

function exitsEarlier(context: Context, child: TSESTree.Node, found: Subtraction): boolean {
  const { sourceCode } = context;
  const { parent } = child;
  const siblings =
    parent?.type === AST_NODE_TYPES.BlockStatement || parent?.type === AST_NODE_TYPES.Program
      ? parent.body
      : [];
  const earlier = siblings.slice(0, siblings.indexOf(child as TSESTree.ProgramStatement));
  return earlier.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.IfStatement &&
      leaves(statement.consequent) &&
      guards(sourceCode.getText(statement.test), found, context),
  );
}

function guardsChild(context: Context, child: TSESTree.Node, found: Subtraction): boolean {
  const { parent } = child;
  const { sourceCode } = context;
  if (
    parent?.type === AST_NODE_TYPES.IfStatement ||
    parent?.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test !== child && guards(sourceCode.getText(parent.test), found, context);
  }
  if (parent?.type === AST_NODE_TYPES.LogicalExpression) {
    return parent.right === child && guards(sourceCode.getText(parent.left), found, context);
  }
  return false;
}

function isGuarded(context: Context, sink: TSESTree.Node, found: Subtraction): boolean {
  let child: TSESTree.Node = sink;
  while (child.type !== AST_NODE_TYPES.Program) {
    if (guardsChild(context, child, found) || exitsEarlier(context, child, found)) {
      return true;
    }
    child = child.parent;
  }
  return false;
}

function sinkName(node: TSESTree.CallExpression | TSESTree.NewExpression): string | undefined {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'Array') {
    return 'Array';
  }
  return node.type === AST_NODE_TYPES.CallExpression &&
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'repeat'
    ? 'repeat'
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not pass a subtraction to repeat or Array without a non-negative guard',
    },
    schema: [],
    messages: {
      negativeCount:
        '`{{sink}}` throws a `RangeError` for a negative count, and `{{text}}` is ' +
        'negative when the right side is larger; use `Math.max(0, {{text}})`, or ' +
        'guard it with a comparison first.',
    },
  },
  create(context) {
    function check(node: TSESTree.CallExpression | TSESTree.NewExpression): void {
      const sink = sinkName(node);
      const [argument] = node.arguments;
      if (sink === undefined || node.arguments.length !== 1 || argument === undefined) {
        return;
      }
      const found = resolve(context, argument);
      if (
        found !== undefined &&
        !isComputedLimit(context, found.node) &&
        !isGuarded(context, node, found)
      ) {
        const text = context.sourceCode.getText(found.node);
        context.report({ node, messageId: 'negativeCount', data: { sink, text } });
      }
    }
    return { CallExpression: check, NewExpression: check };
  },
};
