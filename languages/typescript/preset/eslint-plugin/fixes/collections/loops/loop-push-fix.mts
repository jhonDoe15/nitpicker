import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import { hasArrayType } from '../../../rules/support/checked-types.mts';
import type { Context } from '../../../rules/security/security-values.mts';
import type { FixPlans } from '../../edits/plans.mts';
import { freeName } from '../../edits/names.mts';
import { loopPlan } from './loop-plan.mts';
import { spreadWrite, type Write } from './loop-writes.mts';
import { expressionText } from '../reduce/reduce-site.mts';

type Variable = TSESLint.Scope.Variable;

function spreadStatement(context: Context, write: Write, name: string): string | undefined {
  const { sourceCode } = context;
  const [only] = write.tail;
  if (write.tail.length === 1 && only?.type === AST_NODE_TYPES.SpreadElement) {
    const item = freeName(sourceCode, {
      sites: [write.statement],
      within: write.statement,
      base: 'item',
    });
    return item !== undefined && hasArrayType(context, only.argument) === 'yes'
      ? `for (const ${item} of ${expressionText(sourceCode, only.argument)}) ${name}.push(${item});`
      : undefined;
  }
  return write.tail.some((element) => element.type === AST_NODE_TYPES.SpreadElement)
    ? undefined
    : `${name}.push(${write.tail.map((element) => expressionText(sourceCode, element)).join(', ')});`;
}

export function loopPushFix(context: Context, variable: Variable): FixPlans | undefined {
  return loopPlan(context, variable, { parse: spreadWrite, statementOf: spreadStatement });
}
