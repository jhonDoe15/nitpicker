import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, type SourceCode } from '../../typed/node-views.mts';
import { LOOP_TYPES } from '../spread-shapes.mts';
import type { SpreadKind } from '../accumulating-spread-messages.mts';

type Variable = TSESLint.Scope.Variable;
type Reference = TSESLint.Scope.Reference;
type Inner = (node: TSESTree.Node) => TSESTree.Node;

export type LoopSite = { readonly spread: TSESTree.SpreadElement; readonly kind: SpreadKind };

const LOOP_KINDS = new Map<string, SpreadKind>([
  [AST_NODE_TYPES.ArrayExpression, 'loopArray'],
  [AST_NODE_TYPES.ObjectExpression, 'loopObject'],
]);

function selfSpreads(
  variable: Variable,
  sourceCode: SourceCode,
): readonly TSESTree.SpreadElement[] {
  return variable.references.flatMap((reference) => {
    const { identifier } = reference;
    const spread = identifier.parent;
    return spread.type === AST_NODE_TYPES.SpreadElement &&
      spread.argument === identifier &&
      sourceCode.getTokenBefore(identifier)?.value !== '('
      ? [spread]
      : [];
  });
}

function siteOf(
  reference: Reference,
  context: {
    readonly declaration: TSESTree.Node;
    readonly spreads: ReturnType<typeof selfSpreads>;
    readonly inner: Inner;
  },
): LoopSite | undefined {
  const assignment = reference.identifier.parent;
  if (
    assignment.type !== AST_NODE_TYPES.AssignmentExpression ||
    assignment.operator !== '=' ||
    assignment.left !== reference.identifier
  ) {
    return undefined;
  }
  const value = context.inner(assignment.right);
  const kind = LOOP_KINDS.get(value.type);
  const spread = context.spreads.find((candidate) => contains(value, candidate));
  const inLoop = ancestorsOf(assignment).some(
    (node) => LOOP_TYPES.has(node.type) && !contains(node, context.declaration),
  );
  return kind === undefined || spread === undefined || !inLoop ? undefined : { spread, kind };
}

export function loopSites(
  variable: Variable,
  declaration: TSESTree.Node,
  tools: { readonly sourceCode: SourceCode; readonly inner: Inner },
): readonly LoopSite[] | undefined {
  const spreads = selfSpreads(variable, tools.sourceCode);
  const context = { declaration, spreads, inner: tools.inner };
  const sites: LoopSite[] = [];
  for (const reference of variable.references) {
    if (!reference.isWrite() || reference.init === true) {
      continue;
    }
    const site = siteOf(reference, context);
    if (site === undefined) {
      return undefined;
    }
    sites.push(site);
  }
  return sites;
}
