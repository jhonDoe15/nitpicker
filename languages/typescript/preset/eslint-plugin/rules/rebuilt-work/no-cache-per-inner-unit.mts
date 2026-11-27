import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../analysis/constant-resolution.mts';
import { innermostRepeat, type Repeat } from '../repeated-work/support/loop-invariance.mts';
import {
  contains,
  depthFirst,
  nameOf,
  nodeChildren,
  valueIdentifiersIn,
} from '../typed/node-views.mts';

const CACHE_NAME = /(?:Cache|Caches|Memo|Memoizer|Shared)$/u;
function identifiersIn(node: TSESTree.Node): TSESTree.Identifier[] {
  return valueIdentifiersIn(node, nodeChildren);
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
    for (const param of node.params) {
      heads.push(param);
    }
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
  return !(parent.type === AST_NODE_TYPES.MemberExpression && parent.object === identifier);
}

function boundCache(node: TSESTree.NewExpression): TSESTree.VariableDeclarator | undefined {
  const { parent } = node;
  const named = CACHE_NAME.test(String(nameOf(node.callee))) && node.arguments.length > 0;
  return named &&
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.id.type === AST_NODE_TYPES.Identifier
    ? parent
    : undefined;
}

function perPass(context: SourceContext, node: TSESTree.NewExpression): boolean {
  const declarator = boundCache(node);
  const repeat = innermostRepeat(node);
  if (declarator === undefined || repeat === undefined || !contains(repeat.node, node)) {
    return false;
  }
  return !(
    dependsOnPass(node.arguments, passNames(repeat)) ||
    context.sourceCode
      .getDeclaredVariables(declarator)
      .some((variable) =>
        variable.references.some(
          (reference) => reference.identifier !== declarator.id && escapes(reference),
        ),
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
