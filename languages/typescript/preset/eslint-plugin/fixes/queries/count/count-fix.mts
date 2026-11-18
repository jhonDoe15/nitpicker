import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName, unwrapped, type Context } from '../../../rules/security/security-values.mts';
import { placed } from '../../edits/placement.mts';
import { rewritten, type TextEdit } from '../../edits/text.mts';
import { hasCommentIn, replacing, type FixPlan } from '../../support/ranges.mts';
import { allOf } from '../../edits/plans.mts';
import { prismaCountEdits } from './prisma-count.mts';
import { typeormCountEdits } from './typeorm-count.mts';

export type CountSuggestion = {
  readonly messageId: 'useCount';
  readonly data: Readonly<Record<string, string>>;
  readonly plan: NonNullable<ReturnType<typeof allOf>>;
};

type Site = {
  readonly awaited: TSESTree.AwaitExpression;
  readonly member: TSESTree.Node;
  readonly site: TSESTree.Node;
};

function isBound(site: Site, member: TSESTree.MemberExpression): boolean {
  const declarator = site.awaited.parent;
  return (
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    declarator.id.typeAnnotation === undefined &&
    declarator.init === site.awaited &&
    member.object === site.site
  );
}

function editsFor(context: Context, call: TSESTree.CallExpression): TextEdit[] | undefined {
  return prismaCountEdits(context, call) ?? typeormCountEdits(context, call);
}

type CountEdits = {
  readonly member: TSESTree.MemberExpression;
  readonly edits: readonly TextEdit[];
};

function countPlans(
  context: Context,
  site: Site,
  { member, edits }: CountEdits,
): FixPlan[] | undefined {
  if (isBound(site, member)) {
    const plans = edits.map(({ range, text }) => replacing(range, text));
    return [...plans, replacing(member.range, context.sourceCode.getText(member.object))];
  }
  if (member.object !== site.awaited) {
    return undefined;
  }
  const text = rewritten(context.sourceCode.text, site.awaited.range, edits);
  return text === undefined ? undefined : [replacing(member.range, placed(member, text))];
}

export function countFix(context: Context, site: Site): CountSuggestion | undefined {
  const { member, awaited } = site;
  const call = awaited.argument;
  const fits =
    member.type === AST_NODE_TYPES.MemberExpression &&
    !member.computed &&
    !member.optional &&
    memberName(member) === 'length' &&
    call.type === AST_NODE_TYPES.CallExpression &&
    unwrapped(call) === call;
  if (!fits || hasCommentIn(context.sourceCode, member.range)) {
    return undefined;
  }
  const edits = editsFor(context, call);
  const plans = edits === undefined ? undefined : countPlans(context, site, { member, edits });
  const plan = plans === undefined ? undefined : allOf(plans);
  const method = edits?.[0]?.text;
  return plan === undefined || method === undefined
    ? undefined
    : { messageId: 'useCount', data: { method }, plan };
}
