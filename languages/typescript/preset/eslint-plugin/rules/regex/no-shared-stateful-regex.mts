import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  enclosingScope,
  heldRegex,
  areExclusive,
  isInLoopWithout,
  isLoopCondition,
  type HeldRegex,
} from './regex-bindings.mts';
import { unwrapped } from '../security/security-values.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type Node = TSESTree.Node;
type Context = TSESLint.RuleContext<'sharedRegex', readonly unknown[]>;
type Holder = { readonly key: Node; readonly held: HeldRegex };
type Use = Holder & {
  readonly node: TSESTree.CallExpression;
  readonly method: string;
  readonly target: Node;
  readonly scope: Node | undefined;
};
type Reset = {
  readonly node: TSESTree.AssignmentExpression;
  readonly key: Node;
  readonly scope: Node | undefined;
};
type State = { readonly context: Context; readonly uses: Use[]; readonly resets: Reset[] };

const REGEX_METHODS = new Set<string>(['test', 'exec']);
const STICKY_STRING_METHODS = new Set<string>(['match', 'replace']);

function methodName(callee: Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

function isBefore(left: Node, right: Node): boolean {
  return left.range[1] <= right.range[0];
}

function regexArgument(node: TSESTree.CallExpression, method: string): Node | undefined {
  if (REGEX_METHODS.has(method)) {
    return node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  }
  return STICKY_STRING_METHODS.has(method) ? node.arguments[0] : undefined;
}

function holderKey(context: Context, target: Node): Holder | undefined {
  const held = heldRegex(context, target);
  return held === undefined ? undefined : { key: held.creation, held };
}

function collectUse(
  state: State,
  { node, method, target }: Pick<Use, 'node' | 'method' | 'target'>,
): void {
  const holder = holderKey(state.context, target);
  const skipped =
    holder === undefined || (STICKY_STRING_METHODS.has(method) && holder.held.flag !== 'y');
  if (!skipped) {
    state.uses.push({ node, method, target, ...holder, scope: enclosingScope(node) });
  }
}

function collectReset(state: State, node: TSESTree.AssignmentExpression): void {
  const { left } = node;
  if (left.type !== AST_NODE_TYPES.MemberExpression || methodName(left) !== 'lastIndex') {
    return;
  }
  const holder = holderKey(state.context, left.object);
  if (holder !== undefined) {
    state.resets.push({ node, key: holder.key, scope: enclosingScope(node) });
  }
}

function isReset(state: State, use: Use): boolean {
  return state.resets.some((reset) => reset.key === use.key && reset.scope === use.scope);
}

function isEarlierUse(state: State, use: Use): boolean {
  return state.uses.some(
    (other) =>
      other !== use &&
      other.key === use.key &&
      other.scope === use.scope &&
      isBefore(other.node, use.node) &&
      !areExclusive(other.node, use.node),
  );
}

function isShared(state: State, use: Use): boolean {
  const { creation } = use.held;
  return (
    enclosingScope(creation) !== use.scope ||
    isInLoopWithout(use.node, use.scope, creation) ||
    isEarlierUse(state, use)
  );
}

function report(context: Context, use: Use): void {
  context.report({
    node: use.node,
    messageId: 'sharedRegex',
    data: {
      name: context.sourceCode.getText(unwrapped(use.target)),
      method: use.method,
      flag: use.held.flag,
    },
  });
}

function reportShared(state: State): void {
  for (const use of state.uses) {
    if (!isLoopCondition(use.node) && !isReset(state, use) && isShared(state, use)) {
      report(state.context, use);
    }
  }
}

export const rule: TSESLint.RuleModule<'sharedRegex', [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reusing a regex with the g or y flag across calls through test(), exec() or a sticky match()',
      requiresTypeChecking: false,
    },
    schema: [],
    messages: {
      sharedRegex:
        'Create the regex where it is used, drop `{{ flag }}` when one match is enough, or walk every match with `text.matchAll(pattern)`, which leaves `pattern` untouched. `{{ name }}` has the `{{ flag }}` flag and is reused across calls, so `{{ method }}()` starts at the `lastIndex` the previous call left and the result depends on call order.',
    },
  },
  create(context) {
    const state: State = { context, uses: [], resets: [] };
    return {
      CallExpression(node) {
        const method = methodName(node.callee);
        if (method === undefined) {
          return;
        }
        const target = regexArgument(node, method);
        if (target !== undefined) {
          collectUse(state, { node, method, target });
        }
      },
      AssignmentExpression(node) {
        collectReset(state, node);
      },
      'Program:exit'() {
        reportShared(state);
      },
    };
  },
};
