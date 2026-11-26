import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { innermostRepeat, type Repeat } from '../repeated-work/support/loop-invariance.mts';
import { contains, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';

const CACHE_NAME = /(?:Cache|Caches|Memo|Memoizer|Shared)$/u;
function identifiersIn(node: TSESTree.Node): TSESTree.Identifier[] {
  return [...depthFirst<TSESTree.Node>(node, nodeChildren)].filter(
    (inner): inner is TSESTree.Identifier =>
      inner.type === AST_NODE_TYPES.Identifier &&
      !(
        inner.parent?.type === AST_NODE_TYPES.MemberExpression &&
        inner.parent.property === inner &&
        !inner.parent.computed
      ),
  );
}

function changedIn(node: TSESTree.Node): TSESTree.Node[] {
  return [...depthFirst<TSESTree.Node>(node, nodeChildren)].flatMap((inner) => {
    if (inner.type === AST_NODE_TYPES.VariableDeclarator) {
      return [inner.id];
    }
    if (inner.type === AST_NODE_TYPES.AssignmentExpression) {
      return [inner.left];
    }
    if (inner.type === AST_NODE_TYPES.UpdateExpression) {
      return [inner.argument];
    }
    return [];
  });
}

function passNames(repeat: Repeat): Set<string> {
  const { node } = repeat;
  const heads: TSESTree.Node[] = [...changedIn(node)];
  if (node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement) {
    heads.push(node.left);
  } else if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    heads.push(...node.params);
  }
  return new Set(heads.flatMap((head) => identifiersIn(head).map(({ name }) => name)));
}

function dependsOnPass(args: readonly TSESTree.Node[], names: ReadonlySet<string>): boolean {
  return args.some(
    (arg) =>
      [...depthFirst<TSESTree.Node>(arg, nodeChildren)].some(
        (inner) =>
          inner.type === AST_NODE_TYPES.CallExpression ||
          inner.type === AST_NODE_TYPES.NewExpression ||
          inner.type === AST_NODE_TYPES.AwaitExpression,
      ) || identifiersIn(arg).some(({ name }) => names.has(name)),
  );
}

function escapes(reference: TSESLint.Scope.Reference): boolean {
  const { identifier } = reference;
  const { parent } = identifier;
  return !(parent?.type === AST_NODE_TYPES.MemberExpression && parent.object === identifier);
}

function perPass(context: SourceContext, node: TSESTree.NewExpression): boolean {
  const { parent } = node;
  if (
    !CACHE_NAME.test(nameOf(node.callee) ?? '') ||
    node.arguments.length === 0 ||
    parent.type !== AST_NODE_TYPES.VariableDeclarator ||
    parent.init !== node ||
    parent.id.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const repeat = innermostRepeat(node);
  if (repeat === undefined || !contains(repeat.node, node)) {
    return false;
  }
  const variable = findVariable(context, parent.id, parent.id.name);
  return (
    !dependsOnPass(node.arguments, passNames(repeat)) &&
    !(variable?.references ?? []).some(
      (reference) => reference.identifier !== parent.id && escapes(reference),
    )
  );
}

export const rule: TSESLint.RuleModule<'cachePerPass'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow creating a cache on every pass of a loop when nothing it is built from depends on the pass',
    },
    schema: [],
    messages: {
      cachePerPass:
        'This cache is created again on every pass of the loop although nothing it is built from depends on the element of the pass, so each pass starts empty and works out the same answers again. Create it once before the loop (or once per enclosing unit, such as the file or the run) and share it across the passes.',
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (perPass(context, node)) {
          context.report({ node, messageId: 'cachePerPass' });
        }
      },
    };
  },
};
