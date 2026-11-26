import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
import { enclosingFunction, isFunction, type FunctionNode } from '../typed/syntax-views.mts';
import { isTreeSitterBinding, sourceOf } from './tree-sitter-module.mts';

const CHECKS = new Set(['hasError', 'isError', 'isMissing']);
const CHILD_LISTS = new Set(['children', 'namedChildren']);
const MAPPERS = new Set(['map', 'flatMap']);

function isCheck(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Identifier && CHECKS.has(node.name)) ||
    (node.type === AST_NODE_TYPES.Literal && node.value === 'ERROR')
  );
}

function memberName(node: TSESTree.MemberExpression): string | undefined {
  return node.computed ? undefined : nameOf(node.property);
}

function isChildList(node: TSESTree.Node): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression && CHILD_LISTS.has(memberName(node) ?? '');
}

const STRUCTURE = new Set([
  'children',
  'namedChildren',
  'child',
  'namedChild',
  'firstChild',
  'lastChild',
  'childForFieldName',
  'childrenForFieldName',
]);

function readsStructure(callback: TSESTree.Node | undefined): boolean {
  if (callback === undefined || !isFunction(callback)) {
    return false;
  }
  return [...depthFirst<TSESTree.Node>(callback.body, nodeChildren)].some(
    (node) =>
      node.type === AST_NODE_TYPES.MemberExpression &&
      (node.computed || STRUCTURE.has(memberName(node) ?? '')),
  );
}

function isChildWalk(node: TSESTree.MemberExpression): boolean {
  const { parent } = node;
  if (parent.type !== AST_NODE_TYPES.MemberExpression || parent.object !== node) {
    return false;
  }
  if (parent.computed) {
    return !(parent.parent.type === AST_NODE_TYPES.MemberExpression && parent.parent.optional);
  }
  const { parent: call } = parent;
  return (
    MAPPERS.has(memberName(parent) ?? '') &&
    call.type === AST_NODE_TYPES.CallExpression &&
    readsStructure(call.arguments[0])
  );
}

function isChainedLookup(node: TSESTree.CallExpression): boolean {
  const { callee, parent } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    memberName(callee) !== 'childForFieldName'
  ) {
    return false;
  }
  const holder = parent.type === AST_NODE_TYPES.TSNonNullExpression ? parent.parent : parent;
  return (
    holder.type === AST_NODE_TYPES.MemberExpression &&
    !holder.optional &&
    (holder.object === node || holder.object === parent)
  );
}

function functionNames(fn: FunctionNode): string[] {
  const { parent } = fn;
  const names = [fn.type === AST_NODE_TYPES.FunctionDeclaration ? nameOf(fn.id) : undefined];
  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    names.push(nameOf(parent.id));
  } else if (
    (parent.type === AST_NODE_TYPES.MethodDefinition || parent.type === AST_NODE_TYPES.Property) &&
    !parent.computed
  ) {
    names.push(nameOf(parent.key));
  }
  return names.filter((name): name is string => name !== undefined);
}

function isDeclarationName(node: TSESTree.Identifier): boolean {
  const { parent } = node;
  switch (parent.type) {
    case AST_NODE_TYPES.FunctionDeclaration:
    case AST_NODE_TYPES.FunctionExpression:
    case AST_NODE_TYPES.VariableDeclarator:
      return parent.id === node;
    case AST_NODE_TYPES.MethodDefinition:
    case AST_NODE_TYPES.PropertyDefinition:
      return parent.key === node && !parent.computed;
    default:
      return false;
  }
}

function contains(outer: TSESTree.Node, inner: TSESTree.Node): boolean {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}

export const rule: TSESLint.RuleModule<'unhandledErrorNodes'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tree-sitter walkers to decide what happens with parser error nodes',
    },
    schema: [],
    messages: {
      unhandledErrorNodes:
        'Parsers that recover from errors put an ERROR node (or a MISSING one) in place of any expected child, and the rest of the tree looks normal. This reads the children by position or by field without checking hasError, isError, isMissing or the type "ERROR" here or in a caller of this file. Decide: skip the unit that has an error, or read the error node on purpose.',
    },
  },
  create(context) {
    let usesTreeSitter = false;
    const walks: TSESTree.Node[] = [];
    const checks: TSESTree.Node[] = [];
    const callers = new Map<string, Set<FunctionNode | undefined>>();
    const visitSource = (node: TSESTree.Node): void => {
      const source = sourceOf(node);
      usesTreeSitter ||= source !== undefined && isTreeSitterBinding(source);
    };
    return {
      ImportDeclaration: visitSource,
      ImportExpression: visitSource,
      Identifier(node) {
        if (isCheck(node)) {
          checks.push(node);
        }
        if (!isDeclarationName(node)) {
          const found = callers.get(node.name) ?? new Set<FunctionNode | undefined>();
          found.add(enclosingFunction(node));
          callers.set(node.name, found);
        }
      },
      Literal(node) {
        if (isCheck(node)) {
          checks.push(node);
        }
      },
      MemberExpression(node) {
        if (isChildList(node) && isChildWalk(node)) {
          walks.push(node);
        }
      },
      CallExpression(node) {
        visitSource(node);
        if (isChainedLookup(node)) {
          walks.push(node);
        }
      },
      'Program:exit'() {
        if (!usesTreeSitter) {
          return;
        }
        const checksIn = (fn: FunctionNode | undefined): boolean =>
          fn === undefined
            ? checks.some((check) => enclosingFunction(check) === undefined)
            : checks.some((check) => contains(fn, check));
        const handled = (
          fn: FunctionNode | undefined,
          seen: Set<FunctionNode | undefined>,
        ): boolean => {
          if (fn === undefined) {
            return checksIn(undefined);
          }
          if (seen.has(fn)) {
            return false;
          }
          seen.add(fn);
          if (checksIn(fn)) {
            return true;
          }
          return functionNames(fn).some((name) =>
            [...(callers.get(name) ?? [])].some((caller) => handled(caller, seen)),
          );
        };
        const chainOfFunctions = (node: TSESTree.Node): FunctionNode[] => {
          const found: FunctionNode[] = [];
          for (let fn = enclosingFunction(node); fn !== undefined; fn = enclosingFunction(fn)) {
            found.push(fn);
          }
          return found;
        };
        const reported = new Set<FunctionNode | undefined>();
        for (const walk of walks) {
          const chain = chainOfFunctions(walk);
          const outer = chain.at(-1);
          if (reported.has(outer) || chain.some((fn) => handled(fn, new Set()))) {
            continue;
          }
          if (outer === undefined && checksIn(undefined)) {
            continue;
          }
          reported.add(outer);
          context.report({ node: walk, messageId: 'unhandledErrorNodes' });
        }
      },
    };
  },
};
