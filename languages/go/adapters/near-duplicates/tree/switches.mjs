import { SEND, channelCall } from './expressions.mjs';
import {
  NONE,
  at,
  codeChildren,
  field,
  grouped,
  listOf,
  typeNode,
  withInitializer,
} from './nodes.mjs';

const VALUE = 'value';

const BLOCK_KIND = 'block';
const NESTED_BREAK_TARGETS = new Set([
  'for_statement',
  'expression_switch_statement',
  'type_switch_statement',
  'select_statement',
  'func_literal',
]);

function isCase(part) {
  return part.type.endsWith('_case');
}

function statementsOf(part) {
  return codeChildren(part).filter(({ type }) => type === 'statement_list');
}

function bodyOf(part, context, prefix = []) {
  return at(BLOCK_KIND, part, [...prefix, ...listOf(statementsOf(part), context)]);
}

function endsInFallthrough(part) {
  const last = statementsOf(part)
    .flatMap((list) => codeChildren(list))
    .at(-1);
  return last?.type === 'fallthrough_statement';
}

function breaksSwitch(part) {
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

function testsOf(part, context) {
  return codeChildren(part)
    .filter((child) => child.type === 'expression_list')
    .flatMap((list) => codeChildren(list))
    .map((test) => context.get(test));
}

function whenArm(part, context) {
  return part.type === 'default_case'
    ? grouped('else', part, [bodyOf(part, context)])
    : grouped('case', part, [...testsOf(part, context), bodyOf(part, context)]);
}

function switchArm(parts, index, context) {
  const part = parts[index];
  const entered = endsInFallthrough(part) || (index > 0 && endsInFallthrough(parts[index - 1]));
  return grouped(entered ? 'case' : 'rule', part, [
    grouped('label', part, part.type === 'default_case' ? [] : testsOf(part, context)),
    bodyOf(part, context),
  ]);
}

function subjectOf(source, context) {
  const tag = field(source, VALUE);
  return tag === undefined
    ? at({ kind: 'literal', literal: 'boolean', value: 'true' }, source)
    : context.get(tag);
}

function expressionSwitch(source, context) {
  const parts = codeChildren(source).filter(isCase);
  const plain =
    field(source, VALUE) === undefined &&
    !parts.some((part) => endsInFallthrough(part) || breaksSwitch(part));
  const node = plain
    ? at({ kind: 'statement', value: 'when' }, source, [
        NONE,
        ...parts.map((part) => whenArm(part, context)),
      ])
    : at({ kind: 'statement', value: 'switch' }, source, [
        subjectOf(source, context),
        ...[...parts.keys()].map((index) => switchArm(parts, index, context)),
      ]);
  return withInitializer(source, context, node);
}

function typeArm(part, context) {
  const types = part
    .childrenForFieldName('type')
    .filter((type) => type?.isNamed)
    .map(typeNode);
  return part.type === 'default_case'
    ? grouped('else', part, [bodyOf(part, context)])
    : grouped('case', part, [...types, bodyOf(part, context)]);
}

function typeSwitch(source, context) {
  const subject = context.get(field(source, VALUE));
  const node = at({ kind: 'statement', value: 'type-switch' }, source, [
    subject,
    ...codeChildren(source)
      .filter(isCase)
      .map((part) => typeArm(part, context)),
  ]);
  const alias = codeChildren(field(source, 'alias') ?? source).filter(
    ({ type }) => type === 'identifier',
  );
  const declared =
    field(source, 'alias') === undefined
      ? []
      : alias.map((name) => at('declare', name, [NONE, context.get(name), subject]));
  return withInitializer(source, context, at(BLOCK_KIND, source, [...declared, node]));
}

function receivedBindings(communication, context) {
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

function communicationArm(part, context) {
  const communication = field(part, 'communication');
  const test =
    communication.type === 'send_statement'
      ? channelCall(SEND, communication, [
          context.get(field(communication, 'channel')),
          context.get(field(communication, VALUE)),
        ])
      : context.get(field(communication, 'right'));
  return grouped('case', part, [
    test,
    bodyOf(part, context, receivedBindings(communication, context)),
  ]);
}

function defaultArm(part, context) {
  const marker = at({ kind: 'literal', literal: 'default', value: 'default' }, part);
  return grouped('case', part, [marker, bodyOf(part, context)]);
}

function selectOf(source, context) {
  const arms = codeChildren(source).filter(isCase);
  return at({ kind: 'statement', value: 'select' }, source, [
    NONE,
    ...arms.map((part) =>
      part.type === 'default_case' ? defaultArm(part, context) : communicationArm(part, context),
    ),
  ]);
}

export const SWITCHES = {
  expression_switch_statement: expressionSwitch,
  type_switch_statement: typeSwitch,
  select_statement: selectOf,
};
