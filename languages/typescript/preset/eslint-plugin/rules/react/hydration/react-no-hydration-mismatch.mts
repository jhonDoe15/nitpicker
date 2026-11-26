import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calleeNameOf, isFunction } from '../../typed/syntax-views.mts';
import { ancestorsOf } from '../../typed/node-views.mts';
import { nodesOutsideNestedFunctions } from '../react-effects.mts';
import { enclosingComponent } from '../support/component-names.mts';
import { packageDependsOn } from '../support/package-facts.mts';
import { testsBrowser } from './browser-tests.mts';

const SERVER_RENDERERS = [
  'next',
  '@remix-run/react',
  'gatsby',
  'vike',
  'vike-react',
  '@astrojs/react',
  'waku',
  '@tanstack/react-start',
];

type Branching = TSESTree.ConditionalExpression | TSESTree.LogicalExpression;

function branchTest(
  node: TSESTree.Node,
): { test: TSESTree.Node; branches: TSESTree.Node[] } | undefined {
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return { test: node.test, branches: [node.consequent, node.alternate] };
  }
  return node.type === AST_NODE_TYPES.LogicalExpression && node.operator === '&&'
    ? { test: node.left, branches: [node.right] }
    : undefined;
}

function rendersNothing(branches: readonly TSESTree.Node[]): boolean {
  return branches.every(
    (branch) =>
      (branch.type === AST_NODE_TYPES.Literal &&
        (branch.value === null || branch.value === false)) ||
      (branch.type === AST_NODE_TYPES.Identifier && branch.name === 'undefined'),
  );
}

function rendersPortal(branches: readonly TSESTree.Node[]): boolean {
  return branches.some((branch) =>
    nodesOutsideNestedFunctions(branch).some(
      (node) =>
        node.type === AST_NODE_TYPES.CallExpression && calleeNameOf(node.callee) === 'createPortal',
    ),
  );
}

function suppressed(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.JSXElement &&
      ancestor.openingElement.attributes.some(
        (attribute) =>
          attribute.type === AST_NODE_TYPES.JSXAttribute &&
          attribute.name.name === 'suppressHydrationWarning',
      ),
  );
}

function renderedPosition(node: Branching): boolean {
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.JSXExpressionContainer) {
    return (
      parent.parent.type === AST_NODE_TYPES.JSXElement ||
      parent.parent.type === AST_NODE_TYPES.JSXFragment
    );
  }
  return (
    parent.type === AST_NODE_TYPES.ReturnStatement ||
    (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === node)
  );
}

function insideOtherBranch(node: TSESTree.Node): boolean {
  return ancestorsOf(node).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.JSXExpressionContainer &&
      ancestor.expression !== node &&
      branchTest(ancestor.expression) !== undefined,
  );
}

function inComponentRender(node: TSESTree.Node): boolean {
  const component = enclosingComponent(node);
  const nearest = ancestorsOf(node).find(isFunction);
  return component !== undefined && nearest === component.fn;
}

function check(node: Branching, context: Readonly<TSESLint.RuleContext<'mismatch', []>>): void {
  const found = branchTest(node);
  if (
    found === undefined ||
    !renderedPosition(node) ||
    !inComponentRender(node) ||
    !testsBrowser(found.test, context.sourceCode) ||
    rendersNothing(found.branches) ||
    rendersPortal(found.branches) ||
    insideOtherBranch(node) ||
    suppressed(node)
  ) {
    return;
  }
  context.report({ node: found.test, messageId: 'mismatch' });
}

export const rule: TSESLint.RuleModule<'mismatch'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow rendered output that branches on browser-only values in a server-rendered app',
    },
    schema: [],
    messages: {
      mismatch: [
        'This renders different markup on the server, where `window`, `document` and `navigator` do not exist,',
        'than in the first client render, so React reports a hydration mismatch and renders this part again on',
        'the client. Render the same output on both and switch after mounting: read the browser value with',
        '`useSyncExternalStore(subscribe, getSnapshot, () => serverValue)`, or set it in an effect.',
        'An exception fits only when this component never renders on the server (loaded with `ssr: false`).',
      ].join(' '),
    },
  },
  create(context) {
    if (!packageDependsOn(context.filename, SERVER_RENDERERS)) {
      return {};
    }
    return {
      ConditionalExpression: (node) => {
        check(node, context);
      },
      LogicalExpression: (node) => {
        check(node, context);
      },
    };
  },
};
