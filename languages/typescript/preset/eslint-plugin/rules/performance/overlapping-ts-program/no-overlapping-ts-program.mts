import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../analysis/ancestry.mts';
import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { canReachSequentially, hasLiveReadAfter } from './branch-reachability.mts';
import {
  boundVariable,
  derivedCheckers,
  programFactoryName,
  typescriptBindings,
  type ProgramCall,
} from './ts-program-calls.mts';

type MessageId = 'overlappingProgram' | 'overlappingChecker';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

type OverlapFinding =
  | { readonly messageId: 'overlappingProgram'; readonly binding: string; readonly second: string }
  | {
      readonly messageId: 'overlappingChecker';
      readonly binding: string;
      readonly first: string;
      readonly second: string;
    };

function isEnclosingUnit(node: TSESTree.Node): boolean {
  return (
    isFunctionNode(node) ||
    node.type === AST_NODE_TYPES.StaticBlock ||
    node.type === AST_NODE_TYPES.Program
  );
}

function enclosingUnitOf(node: TSESTree.Node): TSESTree.Node {
  return ancestorsOf(node).find(isEnclosingUnit) ?? node;
}

function overlapBetween(
  context: Context,
  pair: Readonly<{ first: ProgramCall; second: ProgramCall }>,
  unit: TSESTree.Node,
): OverlapFinding | undefined {
  const { first, second } = pair;
  if (first.binding === undefined || !canReachSequentially(first.call, second.call, unit)) {
    return undefined;
  }
  if (hasLiveReadAfter(first.binding, second.call, unit)) {
    return {
      messageId: 'overlappingProgram',
      binding: first.binding.variable.name,
      second: second.factory,
    };
  }
  const checker = derivedCheckers(context, first.binding, second.call.range[0]).find((candidate) =>
    hasLiveReadAfter(candidate, second.call, unit),
  );
  if (checker !== undefined) {
    return {
      messageId: 'overlappingChecker',
      binding: checker.variable.name,
      first: first.binding.variable.name,
      second: second.factory,
    };
  }
  return undefined;
}

function reportOverlaps(
  context: Context,
  calls: readonly ProgramCall[],
  unit: TSESTree.Node,
): void {
  const ordered = calls.toSorted((left, right) => left.call.range[0] - right.call.range[0]);
  for (let index = 1; index < ordered.length; index += 1) {
    const second = ordered[index];
    if (second === undefined) {
      continue;
    }
    const finding = ordered
      .slice(0, index)
      .map((first) => overlapBetween(context, { first, second }, unit))
      .find((entry) => entry !== undefined);
    if (finding !== undefined) {
      const { messageId, ...data } = finding;
      context.report({ node: second.call, messageId, data });
    }
  }
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report building a second TypeScript program in the same function while the first program or its type checker is still referenced',
    },
    schema: [],
    messages: {
      overlappingProgram:
        'Building a second TypeScript program with `{{ second }}` while `{{ binding }}` is ' +
        'still referenced keeps both programs live in memory at once. Read what you need from ' +
        'the first program before building the second, or split the two builds into separate ' +
        'functions that return plain data.',
      overlappingChecker:
        'Building a second TypeScript program with `{{ second }}` while `{{ binding }}` (a type ' +
        'checker from `{{ first }}`) is still referenced keeps both programs live in memory at ' +
        'once. Read what you need from the first program before building the second, or split ' +
        'the two builds into separate functions that return plain data.',
    },
  },
  create(context) {
    const bindings = typescriptBindings(context.sourceCode.ast);
    const callsByUnit = new Map<TSESTree.Node, ProgramCall[]>();
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const factory = programFactoryName(context, node, bindings);
        if (factory === undefined) {
          return;
        }
        const unit = enclosingUnitOf(node);
        const list = callsByUnit.get(unit) ?? [];
        list.push({ call: node, factory, binding: boundVariable(context, node) });
        callsByUnit.set(unit, list);
      },
      'Program:exit'() {
        for (const [unit, calls] of callsByUnit) {
          if (calls.length >= 2) {
            reportOverlaps(context, calls, unit);
          }
        }
      },
    };
  },
};
