import { SEND, channelCall } from './expressions.mjs';
import {
  NONE,
  at,
  blockOf,
  codeChildren,
  field,
  grouped,
  listItems,
  listOf,
  namedType,
  tuple,
  typeNode,
  withInitializer,
} from './nodes.mjs';
import { SWITCHES } from './switches.mjs';

const RIGHT = 'right';

const EVALUATE_KIND = 'evaluate';
const BLOCK_KIND = 'block';
const INFERRED_INTEGERS = new Set(['len', 'cap', 'copy']);

function inferredType(value, source) {
  if (value?.type === 'int_literal' || value?.type === 'rune_literal') {
    return namedType(value.type === 'int_literal' ? 'int' : 'rune', source);
  }
  const callee = value?.type === 'call_expression' ? field(value, 'function') : undefined;
  return INFERRED_INTEGERS.has(callee?.text) ? namedType('int', source) : NONE;
}

function declareOf(name, { type, value }, source) {
  return at('declare', source, [type, name, value]);
}

function assignOf(operator, [left, right], source) {
  return at(EVALUATE_KIND, source, [
    at({ kind: 'assign', value: operator }, source, [left, right]),
  ]);
}

function bindings({ names, values, type, source }, context) {
  if (values.length === names.length) {
    return names.map((name, index) =>
      declareOf(
        context.get(name),
        {
          type: type ?? inferredType(values[index], source),
          value: context.get(values[index]),
        },
        source,
      ),
    );
  }
  const declared = names.map((name) =>
    declareOf(context.get(name), { type: type ?? NONE, value: NONE }, source),
  );
  const assigned =
    values.length === 0
      ? []
      : [
          assignOf(
            '=',
            [
              tuple(
                source,
                names.map((name) => context.get(name)),
              ),
              tuple(
                source,
                values.map((value) => context.get(value)),
              ),
            ],
            source,
          ),
        ];
  return [...declared, ...assigned];
}

function shortVar(source, context) {
  const names = listItems(field(source, 'left'));
  const values = listItems(field(source, RIGHT));
  if (names.every((name) => context.isFresh(name))) {
    return bindings({ names, values, source }, context);
  }
  const fresh = names.filter((name) => context.isFresh(name));
  const declared = fresh.map((name) =>
    declareOf(context.get(name), { type: NONE, value: NONE }, name),
  );
  return [...declared, assignOf('=', operands(source, context), source)];
}

function operands(source, context) {
  const [left, right] = ['left', RIGHT].map((name) => listItems(field(source, name)));
  return [
    tuple(
      source,
      left.map((node) => context.get(node)),
    ),
    tuple(
      source,
      right.map((node) => context.get(node)),
    ),
  ];
}

function specOf(source, context) {
  const type = field(source, 'type');
  return bindings(
    {
      names: source.childrenForFieldName('name').filter((name) => name !== null),
      values: listItems(field(source, 'value')),
      type: type === undefined ? undefined : typeNode(type),
      source,
    },
    context,
  );
}

function assignment(source, context) {
  const operator = field(source, 'operator')?.type ?? '=';
  return assignOf(operator, operands(source, context), source);
}

function update(prefix) {
  return (source, context) =>
    at(EVALUATE_KIND, source, [
      at({ kind: 'update', value: `postfix${prefix}` }, source, [
        context.get(codeChildren(source)[0]),
      ]),
    ]);
}

function labelled(kind, source) {
  const [label] = codeChildren(source);
  return at({ kind, ...(label === undefined ? {} : { value: label.text }) }, source);
}

function returned(source, context) {
  const values = codeChildren(source).flatMap((list) => listItems(list));
  return at('return', source, [
    values.length === 0
      ? NONE
      : tuple(
          source,
          values.map((value) => context.get(value)),
        ),
  ]);
}

function ifOf(source, context) {
  return withInitializer(
    source,
    context,
    at('if', source, [
      context.get(field(source, 'condition')),
      blockOf(field(source, 'consequence'), context),
      blockOf(field(source, 'alternative'), context),
    ]),
  );
}

function partOf(statement, fallback, context) {
  return at(
    BLOCK_KIND,
    statement ?? fallback,
    statement === undefined ? [] : listOf([statement], context),
  );
}

function rangeOf(source, clause, context) {
  const names = listItems(field(clause, 'left'));
  const named =
    names.length === 0
      ? NONE
      : tuple(
          clause,
          names.map((name) => context.get(name)),
        );
  return at('foreach', source, [
    NONE,
    named,
    context.get(field(clause, RIGHT)),
    blockOf(field(source, 'body'), context),
  ]);
}

function clauseOf(source, clause, context) {
  const condition = field(clause, 'condition');
  return at('for', source, [
    partOf(field(clause, 'initializer'), clause, context),
    condition === undefined ? NONE : context.get(condition),
    partOf(field(clause, 'update'), clause, context),
    blockOf(field(source, 'body'), context),
  ]);
}

function forOf(source, context) {
  const body = field(source, 'body');
  const head = codeChildren(source).find((child) => child.id !== body.id);
  if (head?.type === 'range_clause') {
    return rangeOf(source, head, context);
  }
  if (head === undefined) {
    return at('for', source, [
      at(BLOCK_KIND, source),
      NONE,
      at(BLOCK_KIND, source),
      blockOf(body, context),
    ]);
  }
  return head.type === 'for_clause'
    ? clauseOf(source, head, context)
    : at('while', source, [context.get(head), blockOf(body, context)]);
}

function simple(kind) {
  return (source, context) => grouped(kind, source, [context.get(codeChildren(source)[0])]);
}

export const STATEMENTS = {
  statement_list: (source, context) => listOf(codeChildren(source), context),
  block: (source, context) => at(BLOCK_KIND, source, listOf(codeChildren(source), context)),
  expression_statement: (source, context) =>
    at(EVALUATE_KIND, source, [context.get(codeChildren(source)[0])]),
  short_var_declaration: shortVar,
  var_declaration: (source, context) => listOf(codeChildren(source), context),
  const_declaration: (source, context) => listOf(codeChildren(source), context),
  var_spec_list: (source, context) => listOf(codeChildren(source), context),
  var_spec: specOf,
  const_spec: specOf,
  type_declaration: () => [],
  empty_statement: () => [],
  assignment_statement: assignment,
  inc_statement: update('++'),
  dec_statement: update('--'),
  if_statement: ifOf,
  for_statement: forOf,
  return_statement: returned,
  break_statement: (source) => labelled('break', source),
  continue_statement: (source) => labelled('continue', source),
  fallthrough_statement: (source) => grouped('fallthrough', source),
  goto_statement: (source) => grouped(`goto:${codeChildren(source)[0]?.text}`, source),
  go_statement: simple('go'),
  defer_statement: simple('defer'),
  labeled_statement: (source, context) => {
    const [label, body] = codeChildren(source);
    return grouped(`label:${label.text}`, source, [blockOf(body, context)]);
  },
  send_statement: (source, context) =>
    at(EVALUATE_KIND, source, [
      channelCall(SEND, source, [
        context.get(field(source, 'channel')),
        context.get(field(source, 'value')),
      ]),
    ]),
  ...SWITCHES,
};
