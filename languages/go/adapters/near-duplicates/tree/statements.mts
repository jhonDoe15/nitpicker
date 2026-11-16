import type { Node } from 'web-tree-sitter';
import type {
  PlacedNode,
  ShapeNode,
} from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import type { GoContext, GoConverter, GoConverters } from '../types/go-types.mts';
import { SEND, channelCall } from './expressions.mts';
import {
  NONE,
  at,
  blockOf,
  codeChildren,
  field,
  fields,
  grouped,
  listItems,
  listOf,
  namedType,
  present,
  required,
  tuple,
  typeNode,
  withInitializer,
} from './nodes.mts';
import { SWITCHES } from './switches.mts';

const BODY = 'body';
const LEFT = 'left';
const RIGHT = 'right';

const EVALUATE_KIND = 'evaluate';
const BLOCK_KIND = 'block';
const INFERRED_INTEGERS = new Set(['len', 'cap', 'copy']);

function inferredType(value: Node | undefined, source: Node): ShapeNode {
  if (value?.type === 'int_literal' || value?.type === 'rune_literal') {
    return namedType(value.type === 'int_literal' ? 'int' : 'rune', source);
  }
  const callee = value?.type === 'call_expression' ? field(value, 'function') : undefined;
  return callee !== undefined && INFERRED_INTEGERS.has(callee.text)
    ? namedType('int', source)
    : NONE;
}

function declareOf(
  name: ShapeNode,
  { type, value }: { readonly type: ShapeNode; readonly value: ShapeNode },
  source: Node,
): PlacedNode {
  return at('declare', source, [type, name, value]);
}

function assignOf(
  operator: string,
  [left, right]: readonly [ShapeNode, ShapeNode],
  source: Node,
): PlacedNode {
  return at(EVALUATE_KIND, source, [
    at({ kind: 'assign', value: operator }, source, [left, right]),
  ]);
}

type Binding = {
  readonly names: readonly Node[];
  readonly values: readonly Node[];
  readonly type?: ShapeNode | undefined;
  readonly source: Node;
};

function bindings({ names, values, type, source }: Binding, context: GoContext): PlacedNode[] {
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

function shortVar(source: Node, context: GoContext): PlacedNode[] {
  const names = listItems(field(source, LEFT));
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

function operands(source: Node, context: GoContext): [ShapeNode, ShapeNode] {
  const left = listItems(field(source, LEFT));
  const right = listItems(field(source, RIGHT));
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

function specOf(source: Node, context: GoContext): PlacedNode[] {
  const type = field(source, 'type');
  return bindings(
    {
      names: fields(source, 'name'),
      values: listItems(field(source, 'value')),
      type: type === undefined ? undefined : typeNode(type),
      source,
    },
    context,
  );
}

function assignment(source: Node, context: GoContext): PlacedNode {
  const operator = field(source, 'operator')?.type ?? '=';
  return assignOf(operator, operands(source, context), source);
}

function update(prefix: string): GoConverter {
  return (source, context) =>
    at(EVALUATE_KIND, source, [
      at({ kind: 'update', value: `postfix${prefix}` }, source, [
        context.get(codeChildren(source)[0]),
      ]),
    ]);
}

function labelled(kind: string, source: Node): PlacedNode {
  const [label] = codeChildren(source);
  return at({ kind, ...(label === undefined ? {} : { value: label.text }) }, source);
}

function returned(source: Node, context: GoContext): PlacedNode {
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

function ifOf(source: Node, context: GoContext): ShapeNode {
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

function partOf(statement: Node | undefined, fallback: Node, context: GoContext): PlacedNode {
  return at(
    BLOCK_KIND,
    statement ?? fallback,
    statement === undefined ? [] : listOf([statement], context),
  );
}

function rangeOf(source: Node, clause: Node, context: GoContext): PlacedNode {
  const names = listItems(field(clause, LEFT));
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
    blockOf(field(source, BODY), context),
  ]);
}

function clauseOf(source: Node, clause: Node, context: GoContext): PlacedNode {
  const condition = field(clause, 'condition');
  return at('for', source, [
    partOf(field(clause, 'initializer'), clause, context),
    condition === undefined ? NONE : context.get(condition),
    partOf(field(clause, 'update'), clause, context),
    blockOf(field(source, BODY), context),
  ]);
}

function forOf(source: Node, context: GoContext): PlacedNode {
  const body = required(source, BODY);
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

function simple(kind: string): GoConverter {
  return (source, context) => grouped(kind, source, [context.get(codeChildren(source)[0])]);
}

export const STATEMENTS: GoConverters = {
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
    return grouped(`label:${present(label).text}`, source, [blockOf(body, context)]);
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
