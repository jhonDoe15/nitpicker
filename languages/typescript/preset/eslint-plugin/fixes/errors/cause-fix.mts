import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { appendingArgument } from '../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';
import { visibleVariable } from '../support/scope.mts';

type CauseSite = {
  readonly wrapper: { readonly optionsIndex?: number | undefined };
  readonly node: TSESTree.NewExpression;
  readonly handler: TSESTree.CatchClause;
};

function bindsCaught(
  sourceCode: SourceCode,
  { node, handler }: Pick<CauseSite, 'node' | 'handler'>,
  caught: string,
): boolean {
  const variable = visibleVariable(sourceCode, node, caught);
  return variable?.defs.some((definition) => definition.node === handler) === true;
}

export function causeFix(
  sourceCode: SourceCode,
  { wrapper, node, handler }: CauseSite,
): FixPlan | undefined {
  const { optionsIndex } = wrapper;
  const { param } = handler;
  const hasSpread = node.arguments.some(
    (argument) => argument.type === AST_NODE_TYPES.SpreadElement,
  );
  if (param?.type !== AST_NODE_TYPES.Identifier || optionsIndex === undefined || hasSpread) {
    return undefined;
  }
  if (!bindsCaught(sourceCode, { node, handler }, param.name)) {
    return undefined;
  }
  const cause = `cause: ${param.name}`;
  const options = node.arguments[optionsIndex];
  if (options === undefined) {
    return node.arguments.length === optionsIndex
      ? appendingArgument(sourceCode, node, `{ ${cause} }`)
      : undefined;
  }
  if (!isPlainObject(options)) {
    return undefined;
  }
  const hasCause = options.properties.some((property) => keyName(property) === 'cause');
  return hasCause ? undefined : addingProperty(sourceCode, options, cause);
}
