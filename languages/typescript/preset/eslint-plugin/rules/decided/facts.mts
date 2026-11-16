import {
  AST_NODE_TYPES,
  TSESLint,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import { isSideEffectFree as untypedIsSideEffectFree } from '../../../../../../shared/logic/purity.mjs';
import {
  foldTerm as untypedFoldTerm,
  isComparison as untypedIsComparison,
  key as untypedKey,
  not as untypedNot,
  term as untypedTerm,
  withRange as untypedWithRange,
} from '../../../../../../shared/logic/terms.mjs';
import { foldTree, type SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import { inside, isFunction, syntaxChildren } from './syntax.mts';

export type Fact = {
  readonly term: Term;
  readonly names: ReadonlySet<string>;
  readonly readsMembers: boolean;
  readonly reason: string | undefined;
};
export type Effects = { readonly writes: Set<string>; memberWrite: boolean; call: boolean };
export type MaybeNode = TSESTree.Node | TSESTree.IfStatement['alternate'] | undefined;
export type FlowContext = {
  readonly sourceCode: SourceCode;
  readonly mutable: ReadonlySet<string>;
  readonly effects: WeakMap<TSESTree.Node, Effects>;
};
type Range = readonly [number, number];
type Written = { readonly target: TSESTree.Node };

const { DefinitionType } = TSESLint.Scope;
const isSideEffectFree: (term: Term) => boolean = untypedIsSideEffectFree;
const foldTerm: <Result>(root: Term, combine: (node: Term, results: Result[]) => Result) => Result =
  untypedFoldTerm;
const isComparison: (node: Term) => boolean = untypedIsComparison;
const key: (root: Term) => string = untypedKey;
const not: (operand: Term) => Term = untypedNot;
const term: (kind: string, value?: string) => Term = untypedTerm;
const withRange: (node: Term, range: Range | undefined) => Term = untypedWithRange;

const EFFECTS = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.ImportExpression,
]);
const RELATIONS = new Set(['<', '<=', '>', '>=']);
const MEMBER_KINDS = new Set(['member', 'index', 'call']);
const NUMBER = ts.TypeFlags.NumberLike;

export function typedServices(
  services: SourceCode['parserServices'],
): services is ParserServicesWithTypeInformation {
  return services?.program !== null && services?.program !== undefined;
}

function rangeKey(range: Range): string {
  return `${String(range[0])}:${String(range[1])}`;
}

function isNumberTyped(services: ParserServicesWithTypeInformation, node: TSESTree.Node): boolean {
  const parts = partsOf(services.getTypeAtLocation(node));
  return parts.every((part) => (part.flags & NUMBER) !== 0);
}

function isRelation(node: TSESTree.Node): node is TSESTree.BinaryExpression {
  return node.type === AST_NODE_TYPES.BinaryExpression && RELATIONS.has(node.operator);
}

function untypedComparisons(
  node: TSESTree.Node,
  services: SourceCode['parserServices'],
): Set<string> {
  return new Set(
    [...inside(node)]
      .filter(isRelation)
      .filter(
        (child) =>
          !(
            typedServices(services) &&
            [child.left, child.right].every((side) => isNumberTyped(services, side))
          ),
      )
      .map((child) => rangeKey(child.range)),
  );
}

/**
 * The condition as a logic term. An order comparison whose operands are not both numbers becomes a
 * named atom, because the solver orders numbers and strings would break transitivity.
 */
export function conditionTerm(node: TSESTree.Node, sourceCode: SourceCode): Term {
  const untyped = untypedComparisons(node, sourceCode.parserServices);
  return foldTerm(toTerm(node, sourceCode), (current, children) => {
    const rebuilt: Term = { ...current, children };
    if (!(isComparison(current) && untyped.has(rangeKey(current.range ?? [0, 0])))) {
      return rebuilt;
    }
    return withRange(term('name', `#compare ${key(rebuilt)}`), current.range);
  });
}

function namesOf(root: Term): Set<string> {
  return foldTerm<Set<string>>(root, (node, children) => {
    const names = new Set(children.flatMap((set) => [...set]));
    if (node.kind === 'name' && node.value !== undefined) {
      names.add(node.value);
    }
    return names;
  });
}

function readsMembers(root: Term): boolean {
  return foldTerm<boolean>(
    root,
    (node, children) => MEMBER_KINDS.has(node.kind) || children.some(Boolean),
  );
}

/** What `conditionNode` tells when it held (`holds`) or failed, and `reason` to name it by. */
export function fact(
  conditionNode: TSESTree.Node,
  sourceCode: SourceCode,
  { holds, reason }: { readonly holds: boolean; readonly reason?: string | undefined },
): Fact {
  const raw = toTerm(conditionNode, sourceCode);
  const condition = conditionTerm(conditionNode, sourceCode);
  return {
    term: holds ? condition : not(condition),
    names: namesOf(raw),
    readsMembers: readsMembers(raw),
    reason,
  };
}

export function patternNames(pattern: TSESTree.Node): string[] {
  return [...inside(pattern)]
    .filter((node) => node.type === AST_NODE_TYPES.Identifier)
    .map((node) => node.name);
}

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
  effects.call ||= EFFECTS.has(node.type) || (isCall && !isPureCall(node, sourceCode));
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
