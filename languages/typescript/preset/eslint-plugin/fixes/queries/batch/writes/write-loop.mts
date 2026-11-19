import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { Context } from '../../../../rules/security/security-values.mts';
import type { FixPlans } from '../../../edits/plans.mts';
import { hasCommentIn } from '../../../support/ranges.mts';
import type { Repeated } from '../../loops/invariants.mts';
import type { LoopCall } from '../../loops/loop-call.mts';
import type { OrmCall } from '../../orm/orm-call.mts';
import { indentOf, pickNames } from '../text.mts';

export type WriteSite = {
  readonly context: Context;
  readonly call: TSESTree.CallExpression;
  readonly loop: LoopCall;
  readonly orm: OrmCall;
  readonly repeated: Repeated;
  readonly statement: TSESTree.ForOfStatement;
};

export type WriteSuggestion = {
  readonly messageId: 'batchWrite' | 'batchInsert';
  readonly plan: FixPlans;
};

export type Chunking = {
  readonly source: string;
  readonly size: number;
  readonly prelude: readonly string[];
  readonly statement: (part: string) => string;
};

export function writeStatement(
  context: Context,
  call: TSESTree.CallExpression,
  loop: LoopCall,
): TSESTree.ForOfStatement | undefined {
  const statement = loop.loop;
  const only = loop.statement;
  const bodyCount = loop.body.type === AST_NODE_TYPES.BlockStatement ? loop.body.body.length : 1;
  const unused =
    only.type === AST_NODE_TYPES.ExpressionStatement &&
    only.expression.type === AST_NODE_TYPES.AwaitExpression &&
    only.expression.argument === call;
  const isLabeled = statement?.parent.type === AST_NODE_TYPES.LabeledStatement;
  if (
    statement === undefined ||
    !unused ||
    bodyCount !== 1 ||
    isLabeled ||
    hasCommentIn(context.sourceCode, statement.range)
  ) {
    return undefined;
  }
  return statement;
}

export function chunkedLoop(site: WriteSite, chunking: Chunking): string | undefined {
  const { sourceCode } = site.context;
  const names = pickNames(sourceCode, site.loop.hoistBefore, 'rows');
  if (names === undefined) {
    return undefined;
  }
  const { index, part } = names;
  const { source, size, prelude, statement } = chunking;
  const indent = indentOf(sourceCode, site.statement);
  const step = String(size);
  return [
    ...prelude,
    `for (let ${index} = 0; ${index} < ${source}.length; ${index} += ${step}) {`,
    `  const ${part} = ${source}.slice(${index}, ${index} + ${step});`,
    `  ${statement(part)}`,
    '}',
  ].join(`\n${indent}`);
}
