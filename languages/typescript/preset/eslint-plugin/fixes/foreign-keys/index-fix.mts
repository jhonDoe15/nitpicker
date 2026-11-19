import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { MIKRO_ORM, TYPEORM } from '../../rules/persistence/orm-bindings.mts';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { importingName } from '../edits/imports.mts';
import { allOf, type FixPlans } from '../edits/plans.mts';
import { appendingArgument } from '../support/calls.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import { inserting, type FixPlan } from '../support/ranges.mts';
import { isImportedName } from '../support/scope.mts';
import { hasMigrationSignal } from './migration-signals.mts';

export type IndexTarget = {
  readonly node: TSESTree.CallExpression;
  readonly orm: string;
};
type Member = TSESTree.PropertyDefinition;

const OPTION = 'index: true';
const TYPEORM_SOURCE = 'typeorm';
const INDEX = 'Index';
const BLOCKING_OPTIONS = new Set(['index', 'unique', 'persist']);

function memberOf(call: TSESTree.CallExpression): Member | undefined {
  const decorator = call.parent;
  const member = decorator.parent;
  return decorator.type === AST_NODE_TYPES.Decorator &&
    member?.type === AST_NODE_TYPES.PropertyDefinition
    ? member
    : undefined;
}

function isAbstractOwner(member: Member): boolean {
  const owner = member.parent.parent;
  return owner.type === AST_NODE_TYPES.ClassDeclaration && owner.abstract;
}

function isImported(sourceCode: SourceCode, identifier: TSESTree.Node): boolean {
  return (
    identifier.type === AST_NODE_TYPES.Identifier &&
    isImportedName(sourceCode, identifier, identifier.name)
  );
}

function indexText(sourceCode: SourceCode, member: Member, callee: string): string | undefined {
  const first = member.decorators[0];
  if (first === undefined) {
    return undefined;
  }
  const lineStart = sourceCode.text.lastIndexOf('\n', first.range[0] - 1) + 1;
  const before = sourceCode.text.slice(lineStart, first.range[0]);
  return /^\s*$/u.test(before) ? `@${callee}()\n${before}` : `@${callee}() `;
}

function typeormFix(
  sourceCode: SourceCode,
  node: TSESTree.CallExpression,
  member: Member,
): FixPlans | undefined {
  const first = member.decorators[0];
  const { callee } = node;
  if (first === undefined) {
    return undefined;
  }
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const { object } = callee;
    const text =
      isImported(sourceCode, object) && object.type === AST_NODE_TYPES.Identifier
        ? indexText(sourceCode, member, `${object.name}.${INDEX}`)
        : undefined;
    return text === undefined ? undefined : allOf([inserting(first.range[0], text)]);
  }
  if (!isImported(sourceCode, callee)) {
    return undefined;
  }
  const edit = importingName(sourceCode, sourceCode.ast, {
    sources: [TYPEORM_SOURCE],
    name: INDEX,
    sites: [member],
  });
  const text = indexText(sourceCode, member, INDEX);
  if (edit === undefined || text === undefined) {
    return undefined;
  }
  return allOf(
    edit.present ? [inserting(first.range[0], text)] : [inserting(first.range[0], text), edit.plan],
  );
}

function optionsFix(sourceCode: SourceCode, call: TSESTree.CallExpression): FixPlan | undefined {
  const [first, second, ...rest] = call.arguments;
  if (rest.length > 0) {
    return undefined;
  }
  if (first === undefined) {
    return appendingArgument(sourceCode, call, `{ ${OPTION} }`);
  }
  const target = second ?? first;
  if (isPlainObject(target)) {
    const blocked = target.properties.some((property) =>
      BLOCKING_OPTIONS.has(keyName(property) ?? ''),
    );
    return blocked ? undefined : addingProperty(sourceCode, target, OPTION);
  }
  const shape =
    first.type === AST_NODE_TYPES.ArrowFunctionExpression || first.type === AST_NODE_TYPES.Literal;
  return second === undefined && shape
    ? appendingArgument(sourceCode, call, `{ ${OPTION} }`)
    : undefined;
}

export function indexFix(
  sourceCode: SourceCode,
  filename: string,
  target: IndexTarget,
): TSESLint.ReportFixFunction | undefined {
  const member = memberOf(target.node);
  if (
    member === undefined ||
    isAbstractOwner(member) ||
    hasMigrationSignal(filename, sourceCode.text)
  ) {
    return undefined;
  }
  if (target.orm === TYPEORM) {
    return typeormFix(sourceCode, target.node, member);
  }
  if (target.orm !== MIKRO_ORM) {
    return undefined;
  }
  const plan = optionsFix(sourceCode, target.node);
  return plan === undefined ? undefined : allOf([plan]);
}
