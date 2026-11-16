import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isSideEffectFree as untypedIsSideEffectFree } from '../../../../../../shared/logic/purity.mjs';
import { foldTree, type SourceCode } from '../typed/node-views.mts';
import { toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import { patternNames, typedServices, type Fact } from './facts.mts';
import { unsteadyReads } from './models/property-kinds.mts';
import { inside, isFunction, syntaxChildren } from './syntax.mts';

export type Effects = { readonly writes: Set<string>; memberWrite: boolean; call: boolean };
export type MaybeNode = TSESTree.Node | TSESTree.IfStatement['alternate'] | undefined;
export type FlowContext = {
  readonly sourceCode: SourceCode;
  readonly mutable: ReadonlySet<string>;
  readonly effects: WeakMap<TSESTree.Node, Effects>;
  readonly captured: Map<TSESTree.Node, readonly Fact[]>;
};
type Written = { readonly target: TSESTree.Node };

const { DefinitionType } = TSESLint.Scope;
const isSideEffectFree: (term: Term) => boolean = untypedIsSideEffectFree;

const EFFECTS = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ImportExpression,
]);

function isPureCall(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  return node.type === AST_NODE_TYPES.CallExpression && isSideEffectFree(toTerm(node, sourceCode));
}

function written(node: TSESTree.Node): Written | undefined {
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return { target: node.left };
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return { target: node.argument };
  }
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return { target: node.id };
  }
  if (node.type === AST_NODE_TYPES.ForOfStatement || node.type === AST_NODE_TYPES.ForInStatement) {
    return { target: node.left };
  }
  if (node.type === AST_NODE_TYPES.CatchClause) {
    return node.param === null ? undefined : { target: node.param };
  }
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === 'delete' ? { target: node.argument } : undefined;
  }
  return undefined;
}

function isUnsteadyRead(node: TSESTree.Node, services: SourceCode['parserServices']): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    typedServices(services) &&
    unsteadyReads(node, services).length > 0
  );
}

function addEffect(effects: Effects, node: TSESTree.Node, sourceCode: SourceCode): void {
  const write = written(node);
  if (write !== undefined) {
    for (const name of patternNames(write.target)) {
      effects.writes.add(name);
    }
    effects.memberWrite ||= [...inside(write.target)].some(
      ({ type }) => type === AST_NODE_TYPES.MemberExpression,
    );
  }
  const isCall =
    node.type === AST_NODE_TYPES.CallExpression ||
    node.type === AST_NODE_TYPES.TaggedTemplateExpression;
  effects.call ||=
    EFFECTS.has(node.type) ||
    (isCall && !isPureCall(node, sourceCode)) ||
    isUnsteadyRead(node, sourceCode.parserServices);
}

const NO_EFFECTS: Effects = Object.freeze({
  writes: new Set<string>(),
  memberWrite: false,
  call: false,
});

function merged(parts: readonly Effects[]): Effects {
  return {
    writes: new Set(parts.flatMap(({ writes }) => [...writes])),
    memberWrite: parts.some(({ memberWrite }) => memberWrite),
    call: parts.some(({ call }) => call),
  };
}

function effectTree(root: TSESTree.Node, { sourceCode, effects }: FlowContext): Effects {
  return foldTree<TSESTree.Node, boolean, Effects>(root, true, {
    expand(node, isRoot) {
      const isOpaque = effects.has(node) || (isFunction(node) && !isRoot);
      return isOpaque
        ? []
        : syntaxChildren(node).map((child): readonly [TSESTree.Node, boolean] => [child, false]);
    },
    combine(node, isRoot, below) {
      const known = effects.get(node);
      if (known !== undefined) {
        return known;
      }
      if (isFunction(node) && !isRoot) {
        return NO_EFFECTS;
      }
      const own = merged(below);
      addEffect(own, node, sourceCode);
      effects.set(node, own);
      return own;
    },
  });
}

/**
 * What running `nodes` may change: assigned names, any member write, any call that is not pure.
 * `flow.effects` keeps the answer for every node below, so nested statements are not walked again.
 */
export function effectsOf(nodes: readonly MaybeNode[], flow: FlowContext): Effects {
  const present = nodes.filter((node) => node !== null && node !== undefined);
  return merged(present.map((root) => effectTree(root, flow)));
}

function survives(known: Fact, effects: Effects, mutable: ReadonlySet<string>): boolean {
  if ([...known.names].some((name) => effects.writes.has(name))) {
    return false;
  }
  if ((effects.call || effects.memberWrite) && known.readsMembers) {
    return false;
  }
  return !(effects.call && [...known.names].some((name) => mutable.has(name)));
}

export function afterEffects(
  facts: readonly Fact[],
  effects: Effects,
  mutable: ReadonlySet<string>,
): Fact[] {
  return facts.filter((known) => survives(known, effects, mutable));
}

/**
 * Names a call could change: variables written after their declaration, imported live bindings
 * and unresolved globals.
 */
export function mutableNames(sourceCode: SourceCode): Set<string> {
  const { scopeManager } = sourceCode;
  const reassigned = (scopeManager?.scopes ?? [])
    .flatMap((scope) => scope.variables)
    .filter(
      (variable) =>
        variable.defs.some(({ type }) => type === DefinitionType.ImportBinding) ||
        variable.references.some((reference) => reference.isWrite() && !reference.init),
    )
    .map((variable) => variable.name);
  const unresolved = (scopeManager?.globalScope?.through ?? []).map(
    (reference) => reference.identifier.name,
  );
  return new Set([...reassigned, ...unresolved]);
}
