import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { allOf } from '../../../../../fixes/edits/plans.mts';
import { freeName } from '../../../../../fixes/edits/names.mts';
import {
  hasCommentIn,
  inserting,
  replacing,
  type ReportFix,
} from '../../../../../fixes/support/ranges.mts';
import { isDeclared } from '../../../../../fixes/support/scope.mts';
import type { Context } from '../../../../security/security-values.mts';
import { variableNamed, type SourceCode } from '../../../../typed/node-views.mts';
import { isExported } from '../../../../typed/syntax-views.mts';
import { isAssignmentTarget, isReadOnlyUse } from '../../receivers/read-only-uses.mts';
import { memberName, someNode } from '../../repeated-runs.mts';
import { printedType } from '../element-types.mts';
import { lookupShape, type LookupShape } from './lookup-shape.mts';
import { checkedItem } from './lookup-types.mts';
import { insertionSlot } from './map-slot.mts';

const STEP = '  ';

function constantDeclarator(
  sourceCode: SourceCode,
  receiver: TSESTree.Identifier,
): TSESTree.VariableDeclarator | undefined {
  const variable = variableNamed(sourceCode, receiver);
  const definition = variable?.defs[0];
  const declarator = definition?.node;
  if (
    variable === undefined ||
    definition?.type !== TSESLint.Scope.DefinitionType.Variable ||
    declarator?.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.parent?.type !== AST_NODE_TYPES.VariableDeclaration ||
    definition.parent.kind !== 'const' ||
    declarator.init === null ||
    isExported(declarator)
  ) {
    return undefined;
  }
  const readOnly = variable.references
    .filter((reference) => !reference.init)
    .every((reference) => reference.isRead() && isReadOnlyUse(reference.identifier));
  return readOnly ? declarator : undefined;
}

function isKeyWritten(sourceCode: SourceCode, key: string): boolean {
  return someNode(sourceCode.ast, (node) => {
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      return memberName(node) === key && isAssignmentTarget(node);
    }
    return (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.object.type === AST_NODE_TYPES.Identifier &&
      node.callee.object.name === 'Object' &&
      ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(
        memberName(node.callee) ?? '',
      )
    );
  });
}

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

type Plan = {
  readonly shape: LookupShape;
  readonly name: string;
  readonly itemText: string;
  readonly index: string;
};

function loopLines({ shape, name, itemText, index }: Plan, keyText: string): string[] {
  const { method, receiver, parameter } = shape;
  const head = (declared: string, source: string) => `for (const ${declared} of ${source}) {`;
  switch (method) {
    case 'some':
      return [
        `const ${name} = new Set<string>();`,
        head(parameter, receiver.name),
        `${STEP}${name}.add(${keyText});`,
        '}',
      ];
    case 'find':
      return [
        `const ${name} = new Map<string, ${itemText}>();`,
        head(parameter, receiver.name),
        `${STEP}if (!${name}.has(${keyText})) {`,
        `${STEP}${STEP}${name}.set(${keyText}, ${parameter});`,
        `${STEP}}`,
        '}',
      ];
    case 'findLast':
      return [
        `const ${name} = new Map<string, ${itemText}>();`,
        head(parameter, receiver.name),
        `${STEP}${name}.set(${keyText}, ${parameter});`,
        '}',
      ];
    case 'findIndex':
      return [
        `const ${name} = new Map<string, number>();`,
        head(`[${index}, ${parameter}]`, `${receiver.name}.entries()`),
        `${STEP}if (!${name}.has(${keyText})) {`,
        `${STEP}${STEP}${name}.set(${keyText}, ${index});`,
        `${STEP}}`,
        '}',
      ];
    default:
      return [
        `const ${name} = new Map<string, number>();`,
        head(`[${index}, ${parameter}]`, `${receiver.name}.entries()`),
        `${STEP}${name}.set(${keyText}, ${index});`,
        '}',
      ];
  }
}

function lookupText(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  { shape, name }: Plan,
): string {
  const value = sourceCode.getText(shape.value);
  if (shape.method === 'some') {
    return `${name}.has(${value})`;
  }
  if (shape.method === 'find' || shape.method === 'findLast') {
    return `${name}.get(${value})`;
  }
  const plain = [AST_NODE_TYPES.VariableDeclarator, AST_NODE_TYPES.ReturnStatement].includes(
    call.parent.type as AST_NODE_TYPES.VariableDeclarator,
  );
  return plain ? `${name}.get(${value}) ?? -1` : `(${name}.get(${value}) ?? -1)`;
}

function usesIndex(shape: LookupShape): boolean {
  return shape.method === 'findIndex' || shape.method === 'findLastIndex';
}

function itemTypeText(context: Context, call: TSESTree.CallExpression, shape: LookupShape) {
  if (shape.method === 'some' || usesIndex(shape)) {
    return '';
  }
  const item = checkedItem(context, shape);
  return item === undefined ? undefined : printedType(context, call, item);
}

function indexName(taken: readonly string[]): string {
  return ['index', 'position', 'offset'].find((name) => !taken.includes(name)) ?? 'ordinal';
}

export function mapFix(context: Context, call: TSESTree.CallExpression): ReportFix | undefined {
  const { sourceCode } = context;
  const shape = lookupShape(call);
  const declarator =
    shape === undefined ? undefined : constantDeclarator(sourceCode, shape.receiver);
  if (shape === undefined || declarator === undefined || hasCommentIn(sourceCode, call.range)) {
    return undefined;
  }
  const itemText =
    checkedItem(context, shape) === undefined ? undefined : itemTypeText(context, call, shape);
  const slot = insertionSlot(sourceCode, call, declarator.parent);
  const collection = shape.method === 'some' ? 'Set' : 'Map';
  if (
    itemText === undefined ||
    slot === undefined ||
    isKeyWritten(sourceCode, shape.key) ||
    isDeclared(sourceCode, slot.statement, collection)
  ) {
    return undefined;
  }
  const base =
    shape.method === 'some'
      ? `${shape.receiver.name}${capitalized(shape.key)}Set`
      : `${shape.receiver.name}By${capitalized(shape.key)}`;
  const name = freeName(sourceCode, {
    sites: [call, slot.statement],
    within: slot.statement,
    base,
  });
  if (name === undefined) {
    return undefined;
  }
  const index = indexName([name, shape.parameter, shape.receiver.name]);
  const plan = { shape, name, itemText, index };
  const lines = loopLines(plan, sourceCode.getText(shape.keyNode));
  const text = `${lines.join(`\n${slot.indent}`)}\n${slot.indent}`;
  return allOf([
    inserting(slot.statement.range[0], text),
    replacing(call.range, lookupText(sourceCode, call, plan)),
  ]);
}
