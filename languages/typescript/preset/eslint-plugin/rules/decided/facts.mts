import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESTree,
} from '@typescript-eslint/utils';
import {
  relevantFacts as untypedRelevantFacts,
  solveFacts as untypedSolveFacts,
} from '../../../../../../shared/logic/sync/solve-facts.mjs';
import {
  foldTerm as untypedFoldTerm,
  isComparison as untypedIsComparison,
  key as untypedKey,
  not as untypedNot,
  term as untypedTerm,
  withRange as untypedWithRange,
} from '../../../../../../shared/logic/terms.mjs';
import type { SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import { toTerm, type Term } from '../analysis/logic/estree-terms.mts';
import { withPredicateCalls } from './predicate-calls/predicate-calls.mts';
import { withModels } from './models/value-models.mts';
import { unsteadyReads, withUnsteadyReads } from './models/property-kinds.mts';
import { inside, rangeKey } from './syntax.mts';

export type Fact = {
  readonly term: Term;
  readonly names: ReadonlySet<string>;
  readonly readsMembers: boolean;
  readonly reason: string | undefined;
};
type Range = readonly [number, number];

const foldTerm: <Result>(root: Term, combine: (node: Term, results: Result[]) => Result) => Result =
  untypedFoldTerm;
const isComparison: (node: Term) => boolean = untypedIsComparison;
const key: (root: Term) => string = untypedKey;
const not: (operand: Term) => Term = untypedNot;
const term: (kind: string, value?: string) => Term = untypedTerm;
const withRange: (node: Term, range: Range | undefined) => Term = untypedWithRange;

export const relevantFacts: (facts: readonly Fact[], names: ReadonlySet<string>) => Fact[] =
  untypedRelevantFacts;
export const solveFacts: (conditions: readonly Term[], query: Term) => string = untypedSolveFacts;

const RELATIONS = new Set(['<', '<=', '>', '>=']);
const MEMBER_KINDS = new Set(['member', 'index', 'call']);
const NUMBER = ts.TypeFlags.NumberLike;

export function typedServices(
  services: SourceCode['parserServices'],
): services is ParserServicesWithTypeInformation {
  return services?.program !== null && services?.program !== undefined;
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

function baseTerm(node: TSESTree.Node, sourceCode: SourceCode): Term {
  const services = sourceCode.parserServices;
  const untyped = untypedComparisons(node, services);
  const built = foldTerm<Term>(toTerm(node, sourceCode), (current, children) => {
    const rebuilt: Term = { ...current, children };
    if (!(isComparison(current) && untyped.has(rangeKey(current.range ?? [0, 0])))) {
      return rebuilt;
    }
    return withRange(term('name', `#compare ${key(rebuilt)}`), current.range);
  });
  if (!typedServices(services)) {
    return built;
  }
  return withUnsteadyReads(withModels(built, node, services), unsteadyReads(node, services));
}

/**
 * The condition as a logic term. An order comparison whose operands are not both numbers becomes a
 * named atom, because the solver orders numbers and strings would break transitivity.
 */
export function conditionTerm(node: TSESTree.Node, sourceCode: SourceCode): Term {
  return withPredicateCalls(baseTerm(node, sourceCode), node, {
    sourceCode,
    build: (part) => baseTerm(part, sourceCode),
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
  const raw = withPredicateCalls(toTerm(conditionNode, sourceCode), conditionNode, {
    sourceCode,
    build: (part) => toTerm(part, sourceCode),
  });
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

/** The fact that the already built `raw` term holds (`holds`) or fails. */
export function factOfTerm(
  raw: Term,
  { holds, reason }: { readonly holds: boolean; readonly reason?: string | undefined },
): Fact {
  return {
    term: holds ? raw : not(raw),
    names: namesOf(raw),
    readsMembers: readsMembers(raw),
    reason,
  };
}
