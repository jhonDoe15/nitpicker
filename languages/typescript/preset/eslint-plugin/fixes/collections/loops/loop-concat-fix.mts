import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../rules/security/security-values.mts';
import type { FixPlans } from '../../edits/plans.mts';
import { freeName } from '../../edits/names.mts';
import { loopPlan } from './loop-plan.mts';
import { concatWrite, type Write } from './loop-writes.mts';
import { expressionText } from '../reduce/reduce-site.mts';
import { hasDenseDefiniteArrayType, isAppendedAsOne } from '../reduce/type-proofs.mts';

type Variable = TSESLint.Scope.Variable;

function literalItems(array: TSESTree.ArrayExpression): readonly TSESTree.Node[] | undefined {
  const items = array.elements.filter(
    (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
  );
  return items.length === array.elements.length && items.length > 0 ? items : undefined;
}

function isPlainObject(object: TSESTree.ObjectExpression): boolean {
  return object.properties.every(
    (property) => property.type === AST_NODE_TYPES.Property && !property.computed,
  );
}

function isSingleValue(context: Context, argument: TSESTree.Node): boolean {
  if (argument.type === AST_NODE_TYPES.ObjectExpression) {
    return isPlainObject(argument);
  }
  return argument.type === AST_NODE_TYPES.Literal || isAppendedAsOne(context, argument);
}

function concatStatement(context: Context, write: Write, name: string): string | undefined {
  const { sourceCode } = context;
  const [argument] = write.tail;
  if (argument === undefined) {
    return undefined;
  }
  const items =
    argument.type === AST_NODE_TYPES.ArrayExpression ? literalItems(argument) : undefined;
  if (argument.type === AST_NODE_TYPES.ArrayExpression) {
    return items === undefined
      ? undefined
      : `${name}.push(${items.map((item) => expressionText(sourceCode, item)).join(', ')});`;
  }
  if (isSingleValue(context, argument)) {
    return `${name}.push(${expressionText(sourceCode, argument)});`;
  }
  const item = freeName(sourceCode, {
    sites: [write.statement],
    within: write.statement,
    base: 'item',
  });
  return item !== undefined && hasDenseDefiniteArrayType(context, argument)
    ? `for (const ${item} of ${expressionText(sourceCode, argument)}) ${name}.push(${item});`
    : undefined;
}

export function loopConcatFix(context: Context, variable: Variable): FixPlans | undefined {
  return loopPlan(context, variable, { parse: concatWrite, statementOf: concatStatement });
}
