import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { allOf } from '../../../../../fixes/edits/plans.mts';
import { hasCommentIn, replacing, type ReportFix } from '../../../../../fixes/support/ranges.mts';
import { isDeclared } from '../../../../../fixes/support/scope.mts';
import { arrayItemTypes } from '../../../../support/array-items.mts';
import { ancestorsOf } from '../../../../typed/node-views.mts';
import type { Context } from '../../../../security/security-values.mts';
import { methodCallOn, outerOf } from '../../repeated-runs.mts';
import { enclosingFunction } from '../../receivers/later-reads.mts';
import { isAssignmentTarget } from '../../receivers/read-only-uses.mts';
import { canBeNaN } from '../element-types.mts';
import { needsParentheses } from '../parentheses.mts';
import { isGuardedPush } from './guards.mts';
import { membershipOf, type Membership } from './membership.mts';

type Edit = { readonly range: TSESTree.Range; readonly text: string; readonly strict: boolean };

function elementTypeText(
  sourceCode: Context['sourceCode'],
  id: TSESTree.Identifier,
): string | undefined {
  const annotation = id.typeAnnotation?.typeAnnotation;
  if (annotation?.type === AST_NODE_TYPES.TSArrayType) {
    return sourceCode.getText(annotation.elementType);
  }
  const [only] =
    annotation?.type === AST_NODE_TYPES.TSTypeReference
      ? (annotation.typeArguments?.params ?? [])
      : [];
  return annotation?.type === AST_NODE_TYPES.TSTypeReference &&
    annotation.typeName.type === AST_NODE_TYPES.Identifier &&
    annotation.typeName.name === 'Array' &&
    annotation.typeArguments?.params.length === 1 &&
    only !== undefined
    ? sourceCode.getText(only)
    : undefined;
}

function membershipEdit(context: Context, name: string, membership: Membership): Edit {
  const { replaced, element, present } = membership;
  const { sourceCode } = context;
  const call = `${name}.has(${sourceCode.getText(element)})`;
  const negated = needsParentheses(sourceCode, replaced) ? `(!${call})` : `!${call}`;
  return { range: replaced.range, text: present ? call : negated, strict: membership.strict };
}

type MethodSite = {
  readonly name: string;
  readonly reference: TSESTree.Identifier;
  readonly references: ReadonlySet<TSESTree.Node>;
};

function methodEdit(
  context: Context,
  { name, reference, references }: MethodSite,
): Edit | undefined {
  const method = methodCallOn(reference);
  if (method?.call !== undefined && method.name === 'push') {
    const callee = method.call.callee;
    return callee.type === AST_NODE_TYPES.MemberExpression &&
      method.call.arguments.length === 1 &&
      isGuardedPush(context.sourceCode, method.call, references)
      ? { range: callee.property.range, text: 'add', strict: false }
      : undefined;
  }
  const membership = membershipOf(reference);
  if (membership !== undefined) {
    return membershipEdit(context, name, membership);
  }
  return method?.member !== undefined &&
    method.name === 'length' &&
    !isAssignmentTarget(method.member)
    ? { range: method.member.property.range, text: 'size', strict: false }
    : undefined;
}

function isFinalReturn(
  declarator: TSESTree.VariableDeclarator,
  reference: TSESTree.Identifier,
  references: readonly TSESTree.Identifier[],
): boolean {
  const owner = enclosingFunction(declarator);
  const chain = ancestorsOf(reference);
  const inside = owner === undefined ? chain : chain.slice(0, chain.indexOf(owner));
  const guarded = inside.some(
    (ancestor) => ancestor.type === AST_NODE_TYPES.TryStatement && ancestor.finalizer !== null,
  );
  return !guarded && references.every((other) => enclosingFunction(other) === owner);
}

function plainEdit(
  declarator: TSESTree.VariableDeclarator,
  reference: TSESTree.Identifier,
  references: readonly TSESTree.Identifier[],
): Edit | 'none' | undefined {
  const parent = reference.parent;
  if (parent.type === AST_NODE_TYPES.ForOfStatement && parent.right === reference) {
    return 'none';
  }
  if (
    parent.type === AST_NODE_TYPES.SpreadElement &&
    parent.parent.type === AST_NODE_TYPES.ArrayExpression
  ) {
    return 'none';
  }
  const sameFunction = enclosingFunction(reference) === enclosingFunction(declarator);
  return parent.type === AST_NODE_TYPES.ReturnStatement &&
    sameFunction &&
    isFinalReturn(declarator, reference, references)
    ? { range: reference.range, text: `[...${reference.name}]`, strict: false }
    : undefined;
}

type Owner = { readonly declarator: TSESTree.VariableDeclarator; readonly name: string };

function editsOf(
  context: Context,
  { declarator, name }: Owner,
  references: readonly TSESTree.Identifier[],
): Edit[] | undefined {
  const found = new Set<TSESTree.Node>(references);
  const edits: Edit[] = [];
  for (const reference of references) {
    const edit =
      outerOf(reference) === reference
        ? (methodEdit(context, { name, reference, references: found }) ??
          plainEdit(declarator, reference, references))
        : undefined;
    if (edit === undefined) {
      return undefined;
    }
    if (edit !== 'none') {
      edits.push(edit);
    }
  }
  return edits;
}

function overlap(edits: readonly Edit[]): boolean {
  const sorted = edits.toSorted((left, right) => left.range[0] - right.range[0]);
  return sorted.some(
    (edit, index) => index > 0 && (sorted[index - 1]?.range[1] ?? 0) > edit.range[0],
  );
}

function excludesNaN(context: Context, id: TSESTree.Identifier, edits: readonly Edit[]): boolean {
  if (!edits.some((edit) => edit.strict)) {
    return true;
  }
  const typed = arrayItemTypes(context, id);
  return typed !== undefined && typed.items.length > 0 && !typed.items.some(canBeNaN);
}

type EmptyArray = { readonly id: TSESTree.Identifier; readonly init: TSESTree.ArrayExpression };

function emptyArrayOf(
  sourceCode: Context['sourceCode'],
  declarator: TSESTree.VariableDeclarator,
): EmptyArray | undefined {
  const { id, init } = declarator;
  const declaration = declarator.parent;
  return id.type === AST_NODE_TYPES.Identifier &&
    init?.type === AST_NODE_TYPES.ArrayExpression &&
    init.elements.length === 0 &&
    declaration.kind === 'const' &&
    !declaration.declare &&
    !isDeclared(sourceCode, declarator, 'Set')
    ? { id, init }
    : undefined;
}

export function setFix(
  context: Context,
  declarator: TSESTree.VariableDeclarator,
): ReportFix | undefined {
  const { sourceCode } = context;
  const found = emptyArrayOf(sourceCode, declarator);
  const elementType = found === undefined ? undefined : elementTypeText(sourceCode, found.id);
  const variable = sourceCode.getDeclaredVariables(declarator)[0];
  if (found === undefined || elementType === undefined || variable === undefined) {
    return undefined;
  }
  const { id, init } = found;
  const references = variable.references
    .filter((reference) => !reference.init)
    .map((reference) => reference.identifier)
    .filter((identifier) => identifier.type === AST_NODE_TYPES.Identifier);
  const edits = editsOf(context, { declarator, name: id.name }, references);
  const declared: Edit = {
    range: [id.range[0], init.range[1]],
    text: `${id.name} = new Set<${elementType}>()`,
    strict: false,
  };
  if (
    edits === undefined ||
    overlap(edits) ||
    !excludesNaN(context, id, edits) ||
    [declared, ...edits].some((edit) => hasCommentIn(sourceCode, edit.range))
  ) {
    return undefined;
  }
  return allOf([declared, ...edits].map((edit) => replacing(edit.range, edit.text)));
}
