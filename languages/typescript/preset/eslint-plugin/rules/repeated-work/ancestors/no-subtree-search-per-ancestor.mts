import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { callbackRole, someNode } from '../../collections/costly-forms/repeated-runs.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { ancestorsOf, contains } from '../../typed/node-views.mts';
import { readsMemo } from '../support/loop-invariance.mts';
import { climbingName } from './parent-steps.mts';
import { searchShown, subtreeSearches } from './subtree-searches.mts';

const MAX_SHOWN = 60;
const KEPT_SHOWN = 57;

type Loop = TSESTree.ForStatement | TSESTree.WhileStatement | TSESTree.DoWhileStatement;

function readsName(node: TSESTree.Node, name: string, except?: TSESTree.Node): boolean {
  return someNode(
    node,
    (child) =>
      child.type === AST_NODE_TYPES.Identifier &&
      child.name === name &&
      (except === undefined || !contains(except, child)),
  );
}

function testOf(node: TSESTree.Node): TSESTree.Node | undefined {
  if (
    node.type === AST_NODE_TYPES.IfStatement ||
    node.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return node.test;
  }
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    return node.discriminant;
  }
  return node.type === AST_NODE_TYPES.LogicalExpression ? node.left : undefined;
}

function headerNarrows(loop: Loop, name: string): boolean {
  return (
    loop.test !== null &&
    someNode(
      loop.test,
      (node) =>
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.object.type === AST_NODE_TYPES.Identifier &&
        node.object.name === name,
    )
  );
}

function isNarrowed(loop: Loop, search: TSESTree.Node, name: string): boolean {
  return (
    headerNarrows(loop, name) ||
    someNode(loop.body, (node) => {
      const test = testOf(node);
      return (
        test !== undefined &&
        test.range[0] < search.range[0] &&
        !contains(test, search) &&
        readsName(test, name, search)
      );
    })
  );
}

function isMemoized(loop: Loop, name: string): boolean {
  return readsMemo(loop.body, (argument) => readsName(argument, name));
}

function inNestedFunction(search: TSESTree.Node, loop: Loop): boolean {
  const path = ancestorsOf(search);
  return path
    .slice(0, path.indexOf(loop))
    .some((node) => isFunction(node) && callbackRole(node) !== 'callback');
}

export const rule: TSESLint.RuleModule<'searchPerLevel'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow searching every child or the whole subtree at each step of a walk up a parent chain',
    },
    schema: [],
    messages: {
      searchPerLevel:
        'This loop climbs from `{{name}}` towards the root and runs `{{search}}` at every level, so one lookup costs depth times width, and near the root that is the whole document or file. Check the kind of the level first and search only the levels that can answer (`closest(selector)` for an element), or keep the answer per level.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    function check(loop: Loop): void {
      const name = climbingName(loop);
      if (name === undefined || isMemoized(loop, name)) {
        return;
      }
      const search = subtreeSearches(loop.body, name).find(
        (node) => !(isNarrowed(loop, node, name) || inNestedFunction(node, loop)),
      );
      if (search !== undefined) {
        const text = sourceCode.getText(searchShown(search)).split('\n')[0] ?? '';
        context.report({
          node: search,
          messageId: 'searchPerLevel',
          data: {
            name,
            search: text.length > MAX_SHOWN ? `${text.slice(0, KEPT_SHOWN)}...` : text,
          },
        });
      }
    }
    return { ForStatement: check, WhileStatement: check, DoWhileStatement: check };
  },
};
