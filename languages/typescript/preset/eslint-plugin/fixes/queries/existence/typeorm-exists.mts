import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calleeDeclaration, calleeFamily } from '../../../rules/queries/receivers/orm-callee.mts';
import { TYPEORM } from '../../../rules/database/orm-modules.mts';
import { memberName, type Context } from '../../../rules/security/security-values.mts';
import { hasProperty } from '../../../rules/support/checked-types.mts';
import { ownerIndex } from '../typeorm-receivers.mts';
import { allOf } from '../../edits/plans.mts';
import { isPlainObject, keyName } from '../../support/objects.mts';
import { hasCommentIn, replacing, type FixPlan } from '../../support/ranges.mts';
import { placed } from '../../edits/placement.mts';
import { countPolarity, negated, nullPolarity, type Polarity } from './test-rewrite.mts';

type Site = {
  readonly call: TSESTree.CallExpression;
  readonly awaited: TSESTree.AwaitExpression;
  readonly site: TSESTree.Node;
};
type Target = {
  readonly renamed: string;
  readonly counts: boolean;
  readonly byWhere: boolean;
};

const TARGETS = new Map<string, Target>([
  ['findOne', { renamed: 'exists', counts: false, byWhere: false }],
  ['findOneBy', { renamed: 'existsBy', counts: false, byWhere: true }],
  ['count', { renamed: 'exists', counts: true, byWhere: false }],
  ['countBy', { renamed: 'existsBy', counts: true, byWhere: true }],
]);
const OPTION_KEYS = new Set(['where', 'withDeleted']);
const WHERE = 'where';

function optionsAllowed(
  options: TSESTree.CallExpressionArgument | undefined,
  { counts, byWhere }: Target,
): boolean {
  if (byWhere) {
    return options !== undefined && options.type !== AST_NODE_TYPES.SpreadElement;
  }
  if (options === undefined) {
    return counts;
  }
  if (!isPlainObject(options)) {
    return false;
  }
  const keys = options.properties.map((property) => keyName(property));
  return (
    keys.every((key) => key !== undefined && OPTION_KEYS.has(key)) &&
    (counts || keys.includes(WHERE))
  );
}

function testPolarity(
  { counts }: Target,
  binary: TSESTree.BinaryExpression,
  operand: TSESTree.Node,
): Polarity | undefined {
  return counts ? countPolarity(binary, operand) : nullPolarity(binary, operand);
}

function renaming(
  context: Context,
  callee: TSESTree.MemberExpression,
  renamed: string,
): FixPlan | undefined {
  return hasCommentIn(context.sourceCode, callee.property.range)
    ? undefined
    : replacing(callee.property.range, renamed);
}

function renamedText(
  context: Context,
  awaited: TSESTree.AwaitExpression,
  { callee, renamed }: { callee: TSESTree.MemberExpression; renamed: string },
): string {
  const { text } = context.sourceCode;
  const [from, to] = callee.property.range;
  return `${text.slice(awaited.range[0], from)}${renamed}${text.slice(to, awaited.range[1])}`;
}

function rewrittenTest(
  { binary, polarity }: { binary: TSESTree.BinaryExpression; polarity: Polarity },
  positive: string,
): FixPlan {
  const text = polarity === 'present' ? positive : negated(positive);
  return replacing(binary.range, placed(binary, text));
}

function boundPlan(
  context: Context,
  site: Site,
  { target, callee }: Applicable,
): FixPlan[] | undefined {
  const declarator = site.awaited.parent;
  const bound =
    declarator.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.Identifier &&
    declarator.id.typeAnnotation === undefined &&
    declarator.init === site.awaited &&
    site.site.type === AST_NODE_TYPES.Identifier;
  if (!bound) {
    return undefined;
  }
  const rename = renaming(context, callee, target.renamed);
  const binary = site.site.parent;
  if (binary.type !== AST_NODE_TYPES.BinaryExpression) {
    return rename === undefined ? undefined : [rename];
  }
  const polarity = testPolarity(target, binary, site.site);
  if (
    rename === undefined ||
    polarity === undefined ||
    hasCommentIn(context.sourceCode, binary.range)
  ) {
    return undefined;
  }
  return [rename, rewrittenTest({ binary, polarity }, context.sourceCode.getText(site.site))];
}

function inlinePlan(
  context: Context,
  site: Site,
  { target, callee }: Applicable,
): FixPlan[] | undefined {
  const binary = site.awaited.parent;
  if (binary.type !== AST_NODE_TYPES.BinaryExpression) {
    const rename = renaming(context, callee, target.renamed);
    return rename === undefined ? undefined : [rename];
  }
  const polarity = testPolarity(target, binary, site.awaited);
  if (polarity === undefined || hasCommentIn(context.sourceCode, binary.range)) {
    return undefined;
  }
  const call = renamedText(context, site.awaited, { callee, renamed: target.renamed });
  return [rewrittenTest({ binary, polarity }, polarity === 'present' ? call : `(${call})`)];
}

type Applicable = { readonly target: Target; readonly callee: TSESTree.MemberExpression };

function applicable(context: Context, call: TSESTree.CallExpression): Applicable | undefined {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) {
    return undefined;
  }
  const target = TARGETS.get(memberName(callee) ?? '');
  const index = ownerIndex(calleeDeclaration(context, call));
  const fits =
    target !== undefined &&
    index !== undefined &&
    calleeFamily(context, call) === TYPEORM &&
    hasProperty(context, callee.object, target.renamed) &&
    call.arguments.length <= index + 1 &&
    call.arguments.every((argument) => argument.type !== AST_NODE_TYPES.SpreadElement) &&
    optionsAllowed(call.arguments[index], target);
  return fits ? { target, callee } : undefined;
}

export function typeormExistsFix(context: Context, site: Site): ReturnType<typeof allOf> {
  const found = applicable(context, site.call);
  if (found === undefined) {
    return undefined;
  }
  const inline = site.site === site.awaited;
  return allOf(
    (inline ? inlinePlan(context, site, found) : boundPlan(context, site, found)) ?? [undefined],
  );
}
