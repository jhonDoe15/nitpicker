import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nodeChildren } from '../typed/node-views.mts';
import { enclosingUnit } from '../support/flow/enclosing-unit.mts';
import { escapeText as escapeRegExp, leaves } from '../support/flow/guard-forms.mts';

type MessageId = 'rejectsTooLate' | 'acceptsTooMuch';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Bound = {
  readonly bound: TSESTree.BinaryExpression;
  readonly index: string;
  readonly owner: string;
};

const LOOPS = new Set<string>([AST_NODE_TYPES.WhileStatement, AST_NODE_TYPES.ForStatement]);
const LENGTH_NAMES = new Set(['length', 'size', 'count']);
const REJECTING = 'rejecting';
const ACCEPTING = 'accepting';

function ownerOfLength(context: Context, node: TSESTree.Node): string | undefined {
  const value =
    node.type === AST_NODE_TYPES.CallExpression && node.arguments.length === 0 ? node.callee : node;
  if (
    value.type !== AST_NODE_TYPES.MemberExpression ||
    value.computed ||
    value.property.type !== AST_NODE_TYPES.Identifier ||
    !LENGTH_NAMES.has(value.property.name)
  ) {
    return undefined;
  }
  const { object } = value;
  const simple =
    object.type === AST_NODE_TYPES.Identifier ||
    object.type === AST_NODE_TYPES.MemberExpression ||
    object.type === AST_NODE_TYPES.ThisExpression;
  return simple ? context.sourceCode.getText(object) : undefined;
}

function indexText(context: Context, node: TSESTree.Node): string | undefined {
  return node.type === AST_NODE_TYPES.Identifier ? context.sourceCode.getText(node) : undefined;
}

function sidesOf(
  node: TSESTree.BinaryExpression,
  kind: typeof REJECTING | typeof ACCEPTING,
): readonly [TSESTree.Node, TSESTree.Node] | undefined {
  const direct = kind === REJECTING ? '>' : '<=';
  const flipped = kind === REJECTING ? '<' : '>=';
  if (node.operator === direct) {
    return [node.left, node.right];
  }
  return node.operator === flipped ? [node.right, node.left] : undefined;
}

function boundOf(
  context: Context,
  node: TSESTree.Node,
  kind: typeof REJECTING | typeof ACCEPTING,
): Bound | undefined {
  const sides = node.type === AST_NODE_TYPES.BinaryExpression ? sidesOf(node, kind) : undefined;
  if (node.type !== AST_NODE_TYPES.BinaryExpression || sides === undefined) {
    return undefined;
  }
  const index = indexText(context, sides[0]);
  const owner = ownerOfLength(context, sides[1]);
  return index === undefined || owner === undefined ? undefined : { bound: node, index, owner };
}

function isOperation(
  node: TSESTree.Node,
  operator: '||' | '&&',
): node is TSESTree.LogicalExpression {
  return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === operator;
}

function chain(node: TSESTree.Node, operator: '||' | '&&'): TSESTree.Node[] {
  const parts = depthFirst(node, (current) =>
    isOperation(current, operator) ? [current.left, current.right] : [],
  );
  return [...parts].filter((each) => !isOperation(each, operator));
}

function isWrite(node: TSESTree.MemberExpression): boolean {
  const { parent } = node;
  return (
    (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.left === node) ||
    parent.type === AST_NODE_TYPES.UpdateExpression ||
    (parent.type === AST_NODE_TYPES.UnaryExpression && parent.operator === 'delete')
  );
}

function isRead(context: Context, node: TSESTree.Node, { index, owner }: Bound): boolean {
  const { sourceCode } = context;
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.computed &&
    sourceCode.getText(node.object) === owner &&
    sourceCode.getText(node.property) === index &&
    !isWrite(node)
  );
}

function reads(context: Context, roots: readonly TSESTree.Node[], bound: Bound): boolean {
  return roots.some((root) => {
    for (const node of depthFirst(root, nodeChildren)) {
      if (isRead(context, node, bound)) {
        return true;
      }
    }
    return false;
  });
}

function hasPairCheck(text: string, { index, owner }: Bound): boolean {
  const lengthOf = `${escapeRegExp(owner)}\\.\\w+(?:\\(\\))?`;
  const name = escapeRegExp(index);
  const pair = `${name}\\s*(?:>=|<|===)\\s*${lengthOf}|${lengthOf}\\s*(?:<=|>|===)\\s*${name}\\b`;
  return new RegExp(pair, 'u').test(text);
}

function hasMove(text: string, { index }: Bound): boolean {
  const name = escapeRegExp(index);
  const moved = new RegExp(
    `(?<!(?:let|const|var)\\s)\\b${name}\\s*(?:=(?!=)|[-+*/]=|\\+\\+|--)|(?:\\+\\+|--)${name}\\b`,
    'u',
  );
  return moved.test(text);
}

function following(node: TSESTree.IfStatement): TSESTree.Node[] {
  const { parent } = node;
  if (parent.type !== AST_NODE_TYPES.BlockStatement && parent.type !== AST_NODE_TYPES.Program) {
    return [];
  }
  return parent.body.slice(parent.body.indexOf(node) + 1);
}

function enclosingText(context: Context, node: TSESTree.Node): string {
  return context.sourceCode.getText(enclosingUnit(node));
}

type Env = {
  readonly context: Context;
  readonly reported: WeakSet<TSESTree.Node>;
};

function report({ context, reported }: Env, found: Bound, messageId: MessageId): void {
  if (reported.has(found.bound)) {
    return;
  }
  reported.add(found.bound);
  const text = context.sourceCode.getText(found.bound);
  context.report({
    node: found.bound,
    messageId,
    data: { text, index: found.index, owner: found.owner },
  });
}

function isPaired(env: Env, found: Bound, node: TSESTree.Node): boolean {
  return hasPairCheck(enclosingText(env.context, node), found);
}

function isChecked(env: Env, found: Bound, node: TSESTree.Node): boolean {
  return isPaired(env, found, node) || hasMove(enclosingText(env.context, node), found);
}

function disjunction(env: Env, test: TSESTree.Node, after: readonly TSESTree.Node[]): void {
  const parts = chain(test, '||');
  for (const [at, part] of parts.entries()) {
    const found = boundOf(env.context, part, REJECTING);
    const later = [...parts.slice(at + 1), ...after];
    if (found && !isChecked(env, found, part) && reads(env.context, later, found)) {
      report(env, found, 'rejectsTooLate');
    }
  }
}

function conjunction(env: Env, test: TSESTree.Node, body: readonly TSESTree.Node[]): void {
  const parts = chain(test, '&&');
  const checked = LOOPS.has(test.parent?.type ?? '') ? isPaired : isChecked;
  for (const [at, part] of parts.entries()) {
    const found = boundOf(env.context, part, ACCEPTING);
    const later = [...parts.slice(at + 1), ...body];
    if (found && !checked(env, found, part) && reads(env.context, later, found)) {
      report(env, found, 'acceptsTooMuch');
    }
  }
}

function checkLogical(env: Env, node: TSESTree.LogicalExpression): void {
  const { parent } = node;
  if (
    parent.type === AST_NODE_TYPES.LogicalExpression ||
    parent.type === AST_NODE_TYPES.IfStatement ||
    LOOPS.has(parent.type)
  ) {
    return;
  }
  if (node.operator === '||') {
    disjunction(env, node, []);
  } else if (node.operator === '&&') {
    conjunction(env, node, []);
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Do not let an index equal to the length pass a bounds check before a read',
    },
    schema: [],
    messages: {
      rejectsTooLate:
        '`{{text}}` lets `{{index}} == {{owner}}.length` through, and ' +
        '`{{owner}}[{{index}}]` is then past the end; reject with `>=` (`>` is right ' +
        'only for an insertion position).',
      acceptsTooMuch:
        '`{{text}}` accepts `{{index}} == {{owner}}.length`, and ' +
        '`{{owner}}[{{index}}]` is then past the end; accept with `<` (`<=` is right ' +
        'only for an insertion position).',
    },
  },
  create(context) {
    const env: Env = { context, reported: new WeakSet<TSESTree.Node>() };
    return {
      IfStatement(node) {
        const guards = node.alternate === null && leaves(node.consequent);
        disjunction(env, node.test, guards ? following(node) : []);
        conjunction(env, node.test, [node.consequent]);
      },
      WhileStatement(node) {
        conjunction(env, node.test, [node.body]);
      },
      ForStatement(node) {
        if (node.test !== null) {
          conjunction(env, node.test, [node.body]);
        }
      },
      LogicalExpression(node) {
        checkLogical(env, node);
      },
    };
  },
};
