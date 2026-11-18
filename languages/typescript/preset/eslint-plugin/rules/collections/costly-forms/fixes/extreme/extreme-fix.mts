import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { allOf } from '../../../../../fixes/edits/plans.mts';
import { hasCommentIn, replacing, type ReportFix } from '../../../../../fixes/support/ranges.mts';
import { arrayItemTypes } from '../../../../support/array-items.mts';
import { hasArrayType } from '../../../../support/checked-types.mts';
import { typeServices, type Context } from '../../../../security/security-values.mts';
import { calledMember, memberName } from '../../repeated-runs.mts';
import { canBeUndefined, isStringLike, printedType } from '../element-types.mts';
import { inlineComparator, referencedComparator, type Comparator } from './comparators.mts';
import { extremeForm, hasOptionalContinuation, type ExtremeForm } from './extreme-form.mts';

const FRESH_METHODS = new Set([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);
const FRESH_STATICS = new Map([
  ['Object', new Set(['entries', 'keys', 'values'])],
  ['Array', new Set(['from', 'of'])],
]);
const SOURCES = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.Identifier,
  AST_NODE_TYPES.MemberExpression,
]);

function isBuiltInReceiver(context: Context, receiver: TSESTree.Node, name: string): boolean {
  if (name !== 'split') {
    return hasArrayType(context, receiver) === 'yes';
  }
  const type = typeServices(context)?.getTypeAtLocation(receiver);
  return type !== undefined && isStringLike(type);
}

function isFresh(context: Context, source: TSESTree.Node): boolean {
  if (source.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  const callee = source.type === AST_NODE_TYPES.CallExpression ? source.callee : undefined;
  if (callee?.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const name = memberName(callee);
  const owner = callee.object.type === AST_NODE_TYPES.Identifier ? callee.object.name : undefined;
  const statics = owner === undefined ? undefined : FRESH_STATICS.get(owner);
  if (name === undefined) {
    return false;
  }
  return FRESH_METHODS.has(name)
    ? isBuiltInReceiver(context, callee.object, name)
    : statics?.has(name) === true;
}

function comparatorOf(
  context: Context,
  call: TSESTree.CallExpression,
  isText: boolean,
): Comparator | undefined {
  const [argument] = call.arguments;
  if (argument === undefined) {
    return isText ? { candidate: 'candidate', best: 'best', less: 'candidate < best' } : undefined;
  }
  return argument.type === AST_NODE_TYPES.Identifier
    ? referencedComparator(context.sourceCode, argument)
    : inlineComparator(context.sourceCode, argument);
}

function keepsUndefinedOut(context: Context, form: ExtremeForm): boolean {
  const services = typeServices(context);
  const element = form.destructured?.id;
  const target =
    element?.type === AST_NODE_TYPES.ArrayPattern ? element.elements[0] : form.replaced;
  if (services === undefined || target === undefined || target === null) {
    return false;
  }
  return (
    canBeUndefined(services.getTypeAtLocation(target)) || hasOptionalContinuation(form.replaced)
  );
}

function reduceText(
  sourceText: string,
  typeText: string,
  { direction }: ExtremeForm,
  { candidate, best, less }: Comparator,
): string {
  const choice =
    direction === 'first'
      ? `${best} === undefined || ${less} ? ${candidate} : ${best}`
      : `${best} !== undefined && ${less} ? ${best} : ${candidate}`;
  return `${sourceText}.reduce<${typeText} | undefined>((${best}, ${candidate}) => (${choice}), undefined)`;
}

function planFor(form: ExtremeForm, text: string) {
  const { destructured } = form;
  const element =
    destructured?.id.type === AST_NODE_TYPES.ArrayPattern ? destructured.id.elements[0] : undefined;
  if (destructured === undefined || element?.type !== AST_NODE_TYPES.Identifier) {
    return [replacing(form.replaced.range, text)];
  }
  return [replacing(destructured.id.range, element.name), replacing(form.replaced.range, text)];
}

export function extremeFix(context: Context, call: TSESTree.CallExpression): ReportFix | undefined {
  const { sourceCode } = context;
  const member = calledMember(call);
  const method = member === undefined ? undefined : memberName(member);
  const form = extremeForm(call);
  const source = member?.object;
  if (
    member === undefined ||
    form === undefined ||
    source === undefined ||
    !SOURCES.has(source.type) ||
    call.arguments.length > 1 ||
    member.optional ||
    (method !== 'sort' && method !== 'toSorted') ||
    (method === 'sort' && !isFresh(context, source)) ||
    hasArrayType(context, source, false) !== 'yes'
  ) {
    return undefined;
  }
  const [item, ...others] = arrayItemTypes(context, source)?.items ?? [];
  const typeText = item === undefined ? undefined : printedType(context, call, item);
  const comparator =
    item === undefined ? undefined : comparatorOf(context, call, isStringLike(item));
  const range = form.destructured?.range ?? form.replaced.range;
  if (
    item === undefined ||
    others.length > 0 ||
    typeText === undefined ||
    typeText.includes('=>') ||
    comparator === undefined ||
    canBeUndefined(item) ||
    !keepsUndefinedOut(context, form) ||
    hasCommentIn(sourceCode, range)
  ) {
    return undefined;
  }
  const text = reduceText(sourceCode.getText(source), typeText, form, comparator);
  return allOf(planFor(form, text));
}
