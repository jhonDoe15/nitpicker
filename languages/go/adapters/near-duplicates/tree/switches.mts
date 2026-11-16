import type { Node } from 'web-tree-sitter';
import type {
  PlacedNode,
  ShapeNode,
} from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import type { GoContext, GoConverters } from '../types/go-types.mts';
import { SEND, channelCall } from './expressions.mts';
import {
  NONE,
  at,
  codeChildren,
  field,
  fields,
  grouped,
  listOf,
  required,
  typeNode,
  withInitializer,
} from './nodes.mts';

const CASE = 'case';
const DEFAULT_CASE = 'default_case';
const STATEMENT = 'statement';
const VALUE = 'value';

const BLOCK_KIND = 'block';
const NESTED_BREAK_TARGETS = new Set([
  'for_statement',
  'expression_switch_statement',
  'type_switch_statement',
  'select_statement',
  'func_literal',
]);

function isCase(part: Node): boolean {
  return part.type.endsWith('_case');
}

function statementsOf(part: Node): Node[] {
  return codeChildren(part).filter(({ type }) => type === 'statement_list');
}

function bodyOf(part: Node, context: GoContext, prefix: readonly ShapeNode[] = []): PlacedNode {
  return at(BLOCK_KIND, part, [...prefix, ...listOf(statementsOf(part), context)]);
}

function endsInFallthrough(part: Node): boolean {
  const last = statementsOf(part)
    .flatMap((list) => codeChildren(list))
    .at(-1);
  return last?.type === 'fallthrough_statement';
}

function breaksSwitch(part: Node): boolean {
  const pending = statementsOf(part);
  for (const node of pending) {
    if (node.type === 'break_statement' && codeChildren(node).length === 0) {
      return true;
    }
    if (!NESTED_BREAK_TARGETS.has(node.type)) {
      pending.push(...codeChildren(node));
    }
  }
  return false;
}

function testsOf(part: Node, context: GoContext): ShapeNode[] {
  return codeChildren(part)
    .filter((child) => child.type === 'expression_list')
    .flatMap((list) => codeChildren(list))
    .map((test) => context.get(test));
}

function whenArm(part: Node, context: GoContext): PlacedNode {
  return part.type === DEFAULT_CASE
    ? grouped('else', part, [bodyOf(part, context)])
    : grouped(CASE, part, [...testsOf(part, context), bodyOf(part, context)]);
}

function switchArm(part: Node, previous: Node | undefined, context: GoContext): PlacedNode {
  const entered =
    endsInFallthrough(part) || (previous !== undefined && endsInFallthrough(previous));
  return grouped(entered ? CASE : 'rule', part, [
    grouped('label', part, part.type === DEFAULT_CASE ? [] : testsOf(part, context)),
    bodyOf(part, context),
  ]);
}

function subjectOf(source: Node, context: GoContext): ShapeNode {
  const tag = field(source, VALUE);
  return tag === undefined
    ? at({ kind: 'literal', literal: 'boolean', value: 'true' }, source)
    : context.get(tag);
}

function expressionSwitch(source: Node, context: GoContext): ShapeNode {
  const parts = codeChildren(source).filter(isCase);
  const plain =
    field(source, VALUE) === undefined &&
    !parts.some((part) => endsInFallthrough(part) || breaksSwitch(part));
  const node = plain
    ? at({ kind: STATEMENT, value: 'when' }, source, [
        NONE,
        ...parts.map((part) => whenArm(part, context)),
      ])
    : at({ kind: STATEMENT, value: 'switch' }, source, [
        subjectOf(source, context),
        ...parts.map((part, index) => switchArm(part, parts[index - 1], context)),
      ]);
  return withInitializer(source, context, node);
}

function typeArm(part: Node, context: GoContext): PlacedNode {
  const types = fields(part, 'type')
    .filter((type) => type.isNamed)
    .map((type) => typeNode(type));
  return part.type === DEFAULT_CASE
    ? grouped('else', part, [bodyOf(part, context)])
    : grouped(CASE, part, [...types, bodyOf(part, context)]);
}

function typeSwitch(source: Node, context: GoContext): ShapeNode {
  const subject = context.get(field(source, VALUE));
  const node = at({ kind: STATEMENT, value: 'type-switch' }, source, [
    subject,
    ...codeChildren(source)
      .filter(isCase)
      .map((part) => typeArm(part, context)),
  ]);
  const aliases = field(source, 'alias');
  const declared =
    aliases === undefined
      ? []
      : codeChildren(aliases)
          .filter(({ type }) => type === 'identifier')
          .map((name) => at('declare', name, [NONE, context.get(name), subject]));
  return withInitializer(source, context, at(BLOCK_KIND, source, [...declared, node]));
}

function receivedBindings(communication: Node, context: GoContext): PlacedNode[] {
  const left = field(communication, 'left');
  if (left === undefined) {
    return [];
  }
  const declares = communication.children.some((child) => child.type === ':=');
  return codeChildren(left).map((name) =>
    declares
      ? at('declare', name, [NONE, context.get(name), NONE])
      : at('evaluate', name, [
          at({ kind: 'assign', value: '=' }, name, [
            context.get(name),
            at({ kind: 'expression', value: 'received' }, name),
          ]),
        ]),
  );
}

function communicationArm(part: Node, context: GoContext): PlacedNode {
  const communication = required(part, 'communication');
  const test =
    communication.type === 'send_statement'
      ? channelCall(SEND, communication, [
          context.get(field(communication, 'channel')),
          context.get(field(communication, VALUE)),
        ])
      : context.get(field(communication, 'right'));
  return grouped(CASE, part, [
    test,
    bodyOf(part, context, receivedBindings(communication, context)),
  ]);
}

function defaultArm(part: Node, context: GoContext): PlacedNode {
  const marker = at({ kind: 'literal', literal: 'default', value: 'default' }, part);
  return grouped(CASE, part, [marker, bodyOf(part, context)]);
}

function selectOf(source: Node, context: GoContext): PlacedNode {
  const arms = codeChildren(source).filter(isCase);
  return at({ kind: STATEMENT, value: 'select' }, source, [
    NONE,
    ...arms.map((part) =>
      part.type === DEFAULT_CASE ? defaultArm(part, context) : communicationArm(part, context),
    ),
  ]);
}

export const SWITCHES: GoConverters = {
  expression_switch_statement: expressionSwitch,
  type_switch_statement: typeSwitch,
  select_statement: selectOf,
};
