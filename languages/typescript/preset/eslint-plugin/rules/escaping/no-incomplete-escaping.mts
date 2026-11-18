import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../typed/node-views.mts';
import {
  chainOf,
  chainRoot,
  handlesBackslash,
  insertsBackslash,
  isEscapePair,
  isEscapeSequence,
  isOutermost,
  replacementOf,
  type Replacement,
} from './replace-chains.mts';

type MessageId = 'escapeBackslash' | 'unescapeOrder';
type Candidate = {
  readonly call: TSESTree.CallExpression;
  readonly scope: TSESTree.Node | undefined;
};

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function outermostFunction(node: TSESTree.Node): TSESTree.Node | undefined {
  return ancestorsOf(node)
    .filter((ancestor) => FUNCTIONS.has(ancestor.type))
    .at(-1);
}

function opaqueRoot(root: TSESTree.Node | undefined): boolean {
  return (
    root?.type === AST_NODE_TYPES.CallExpression || root?.type === AST_NODE_TYPES.AwaitExpression
  );
}

function unescapesInWrongOrder(chain: readonly Replacement[]): boolean {
  return chain.some(isEscapePair) && chain.some(isEscapeSequence);
}

function escapeCandidates(chain: readonly Replacement[]): Replacement[] {
  return chain.filter(
    (step, index) =>
      insertsBackslash(step) && !chain.slice(0, index).some((earlier) => handlesBackslash(earlier)),
  );
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow replace chains that escape a quote without escaping the backslash itself',
    },
    schema: [],
    messages: {
      escapeBackslash:
        'This `replace` adds a backslash before a character but nothing escapes the backslash itself, ' +
        'so a value holding `\\` round-trips wrong. Match both in one pattern: ' +
        '`value.replace(/[\\\\"]/g, (c) => `\\\\${c}`)`.',
      unescapeOrder:
        'This chain unescapes one sequence at a time and handles `\\\\` in a separate step, so the order ' +
        'decides the result. Decode in one pass: `text.replace(/\\\\(["\'nt\\\\])/g, (_, c) => table[c])`.',
    },
  },
  create(context) {
    const candidates: Candidate[] = [];
    const handlers: TSESTree.Node[] = [];
    return {
      CallExpression(node) {
        const step = replacementOf(context, node);
        if (step === undefined) {
          return;
        }
        if (handlesBackslash(step)) {
          handlers.push(node);
        }
        if (!isOutermost(context, node)) {
          return;
        }
        const chain = chainOf(context, node);
        if (unescapesInWrongOrder(chain)) {
          context.report({ node, messageId: 'unescapeOrder' });
        } else if (!opaqueRoot(chainRoot(chain))) {
          candidates.push(
            ...escapeCandidates(chain).map((found) => ({
              call: found.call,
              scope: outermostFunction(node),
            })),
          );
        }
      },
      'Program:exit'() {
        for (const { call, scope } of candidates) {
          const covered = handlers.some(
            (handler) => outermostFunction(handler) === scope && !overlaps(handler, call),
          );
          if (!covered) {
            context.report({ node: call, messageId: 'escapeBackslash' });
          }
        }
      },
    };
  },
};

function overlaps(handler: TSESTree.Node, call: TSESTree.CallExpression): boolean {
  return handler.range[0] < call.range[1] && call.range[0] < handler.range[1];
}
