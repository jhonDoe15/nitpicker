import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, depthFirst, nameOf, nodeChildren } from '../typed/node-views.mts';
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
  if (
    parent.type === AST_NODE_TYPES.FunctionDeclaration ||
    parent.type === AST_NODE_TYPES.FunctionExpression ||
    parent.type === AST_NODE_TYPES.VariableDeclarator
  ) {
    return parent.id === node;
  }
  return (
    (parent.type === AST_NODE_TYPES.MethodDefinition ||
      parent.type === AST_NODE_TYPES.PropertyDefinition) &&
    parent.key === node &&
    !parent.computed
  );
}

type Callers = Map<string, Set<FunctionNode | undefined>>;

type Facts = {
  readonly walks: TSESTree.Node[];
  readonly checks: TSESTree.Node[];
  readonly callers: Callers;
  usesTreeSitter: boolean;
};

type ErrorCheckContext = Readonly<TSESLint.RuleContext<'unhandledErrorNodes', []>>;

function recordSource(facts: Facts, node: TSESTree.Node): void {
  const source = sourceOf(node);
  facts.usesTreeSitter ||= source !== undefined && isTreeSitterBinding(source);
}

function recordCheck(facts: Facts, node: TSESTree.Node): void {
  if (isCheck(node)) {
    facts.checks.push(node);
  }
}

function recordIdentifier(facts: Facts, node: TSESTree.Identifier): void {
  recordCheck(facts, node);
  if (isDeclarationName(node)) {
    return;
  }
  const found = facts.callers.get(node.name) ?? new Set<FunctionNode | undefined>();
  found.add(enclosingFunction(node));
  facts.callers.set(node.name, found);
}

function checksIn(facts: Facts, fn: FunctionNode | undefined): boolean {
  return fn === undefined
    ? facts.checks.some((check) => enclosingFunction(check) === undefined)
    : facts.checks.some((check) => contains(fn, check));
}

function callersOf(facts: Facts, fn: FunctionNode): (FunctionNode | undefined)[] {
  return functionNames(fn).flatMap((name) => [...(facts.callers.get(name) ?? [])]);
}

function isHandled(facts: Facts, start: FunctionNode | undefined): boolean {
  const pending = [start];
  const seen = new Set<FunctionNode | undefined>();
  for (const fn of pending) {
    if (seen.has(fn)) {
      continue;
    }
    seen.add(fn);
    if (checksIn(facts, fn)) {
      return true;
    }
    const callers = fn === undefined ? [] : callersOf(facts, fn);
    for (const caller of callers) {
      pending.push(caller);
    }
  }
  return false;
}

function reportUnhandledWalks(context: ErrorCheckContext, facts: Facts): void {
  if (!facts.usesTreeSitter) {
    return;
  }
  const reported = new Set<FunctionNode | undefined>();
  for (const walk of facts.walks) {
    const chain = ancestorsOf(walk).filter(isFunction);
    const outer = chain.at(-1);
    if (reported.has(outer) || chain.some((fn) => isHandled(facts, fn))) {
      continue;
    }
    if (outer === undefined && checksIn(facts, undefined)) {
      continue;
    }
    reported.add(outer);
    context.report({ node: walk, messageId: 'unhandledErrorNodes' });
  }
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
    const facts: Facts = { walks: [], checks: [], callers: new Map(), usesTreeSitter: false };
    function visitSource(node: TSESTree.Node): void {
      recordSource(facts, node);
    }
    return {
      ImportDeclaration: visitSource,
      ImportExpression: visitSource,
      Identifier(node) {
        recordIdentifier(facts, node);
      },
      Literal(node) {
        recordCheck(facts, node);
      },
      MemberExpression(node) {
        if (isChildList(node) && isChildWalk(node)) {
          facts.walks.push(node);
        }
      },
      CallExpression(node) {
        recordSource(facts, node);
        if (isChainedLookup(node)) {
          facts.walks.push(node);
        }
      },
      'Program:exit'() {
        reportUnhandledWalks(context, facts);
      },
    };
  },
};
