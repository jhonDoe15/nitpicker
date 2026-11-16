import type { Node } from 'web-tree-sitter';
import { listOf, statementsOf } from '../jvm-views.mts';
import type { BaseContext, Converter, PlacedNode, ShapeNode } from '../jvm-types.mts';
import {
  NONE,
  at,
  blockOrStatements,
  codeChildren,
  field,
  fields,
  grouped,
  present,
  required,
  typeNode,
} from './nodes.mts';

const BLOCK_KIND = 'block';
const EVALUATE_KIND = 'evaluate';
const CONDITION_FIELD = 'condition';
const VALUE_FIELD = 'value';

function blockOf(source: Node | undefined, context: BaseContext): ShapeNode {
  return blockOrStatements(source, context, statementsOf);
}

function optionalChild(source: Node, context: BaseContext): ShapeNode {
  const [child] = codeChildren(source);
  return child === undefined ? NONE : context.get(child);
}

function declareOf(declarator: Node, type: ShapeNode, context: BaseContext): PlacedNode {
  const value = field(declarator, VALUE_FIELD);
  return at('declare', declarator, [
    type,
    context.get(field(declarator, 'name')),
    value === undefined ? NONE : context.get(value),
  ]);
}

function declarationsOf(source: Node, context: BaseContext): PlacedNode[] {
  const type = typeNode(field(source, 'type'));
  return fields(source, 'declarator').map((declarator) => declareOf(declarator, type, context));
}

function forPart(sources: readonly Node[], context: BaseContext): PlacedNode[] {
  return sources.flatMap((source) =>
    source.type === 'local_variable_declaration'
      ? declarationsOf(source, context)
      : [at(EVALUATE_KIND, source, [context.get(source)])],
  );
}

function labelled(kind: string, source: Node): PlacedNode {
  const [label] = codeChildren(source);
  return at({ kind, ...(label === undefined ? {} : { value: label.text }) }, source);
}

function switchBody(source: Node, context: BaseContext): PlacedNode[] {
  return codeChildren(required(source, 'body')).map((part) => {
    const [labels, rest] = [
      codeChildren(part).filter((child) => child.type === 'switch_label'),
      codeChildren(part).filter((child) => child.type !== 'switch_label'),
    ];
    const tests = labels.map((label) =>
      grouped(
        'label',
        label,
        codeChildren(label).map((test) => context.get(test)),
      ),
    );
    const body =
      part.type === 'switch_rule'
        ? rest.flatMap((child) => statementsOf(child, context))
        : [at(BLOCK_KIND, part, listOf(rest, context))];
    return grouped(part.type === 'switch_rule' ? 'rule' : 'case', part, [...tests, ...body]);
  });
}

function switchOf(source: Node, context: BaseContext): PlacedNode {
  const kind =
    source.parent?.type === BLOCK_KIND || source.parent?.type === 'expression_statement'
      ? 'statement'
      : 'expression';
  return at({ kind, value: 'switch' }, source, [
    context.get(field(source, CONDITION_FIELD)),
    ...switchBody(source, context),
  ]);
}

function catchOf(clause: Node, context: BaseContext): PlacedNode {
  const parameter = present(
    codeChildren(clause).find((child) => child.type === 'catch_formal_parameter'),
  );
  const types = codeChildren(parameter).filter((child) => child.type === 'catch_type');
  return grouped('catch', clause, [
    ...types.map(typeNode),
    context.get(field(parameter, 'name')),
    blockOf(field(clause, 'body'), context),
  ]);
}

function tryParts(source: Node, context: BaseContext): PlacedNode[] {
  return codeChildren(source).flatMap((child) => {
    if (child.type === 'catch_clause') {
      return [catchOf(child, context)];
    }
    if (child.type === 'finally_clause') {
      return [grouped('finally', child, [blockOf(codeChildren(child)[0], context)])];
    }
    return [];
  });
}

function resourceOf(resource: Node, context: BaseContext): PlacedNode {
  const name = field(resource, 'name');
  if (name === undefined) {
    return at(EVALUATE_KIND, resource, [context.get(codeChildren(resource)[0])]);
  }
  return at('declare', resource, [
    typeNode(field(resource, 'type')),
    context.get(name),
    context.get(field(resource, VALUE_FIELD)),
  ]);
}

export const STATEMENTS: Readonly<Record<string, Converter>> = {
  block: (source, context) => at(BLOCK_KIND, source, listOf(codeChildren(source), context)),
  constructor_body: (source, context) =>
    at(BLOCK_KIND, source, listOf(codeChildren(source), context)),
  local_variable_declaration: declarationsOf,
  expression_statement: (source, context) =>
    at(EVALUATE_KIND, source, [context.get(codeChildren(source)[0])]),
  if_statement: (source, context) =>
    at('if', source, [
      context.get(field(source, CONDITION_FIELD)),
      blockOf(field(source, 'consequence'), context),
      blockOf(field(source, 'alternative'), context),
    ]),
  return_statement: (source, context) => at('return', source, [optionalChild(source, context)]),
  throw_statement: (source, context) => at('throw', source, [optionalChild(source, context)]),
  break_statement: (source) => labelled('break', source),
  continue_statement: (source) => labelled('continue', source),
  for_statement: (source, context) =>
    at('for', source, [
      at(BLOCK_KIND, source, forPart(fields(source, 'init'), context)),
      field(source, CONDITION_FIELD) === undefined
        ? NONE
        : context.get(field(source, CONDITION_FIELD)),
      at(BLOCK_KIND, source, forPart(fields(source, 'update'), context)),
      blockOf(field(source, 'body'), context),
    ]),
  enhanced_for_statement: (source, context) =>
    at('foreach', source, [
      typeNode(field(source, 'type')),
      context.get(field(source, 'name')),
      context.get(field(source, VALUE_FIELD)),
      blockOf(field(source, 'body'), context),
    ]),
  while_statement: (source, context) =>
    at('while', source, [
      context.get(field(source, CONDITION_FIELD)),
      blockOf(field(source, 'body'), context),
    ]),
  do_statement: (source, context) =>
    at('do', source, [
      blockOf(field(source, 'body'), context),
      context.get(field(source, CONDITION_FIELD)),
    ]),
  switch_expression: switchOf,
  try_statement: (source, context) =>
    grouped('try', source, [blockOf(field(source, 'body'), context), ...tryParts(source, context)]),
  try_with_resources_statement: (source, context) =>
    grouped('try', source, [
      ...codeChildren(required(source, 'resources')).map((resource) =>
        resourceOf(resource, context),
      ),
      blockOf(field(source, 'body'), context),
      ...tryParts(source, context),
    ]),
  labeled_statement: (source, context) => {
    const [label, body] = codeChildren(source);
    return grouped(`label:${present(label).text}`, source, [blockOf(body, context)]);
  },
  synchronized_statement: (source, context) =>
    grouped('synchronized', source, [
      context.get(codeChildren(source)[0]),
      blockOf(field(source, 'body'), context),
    ]),
  assert_statement: (source, context) =>
    grouped(
      'assert',
      source,
      codeChildren(source).map((child) => context.get(child)),
    ),
  yield_statement: (source, context) => grouped('yield', source, [optionalChild(source, context)]),
  explicit_constructor_invocation: (source, context) =>
    at(EVALUATE_KIND, source, [
      at('call', source, [
        context.name(required(source, 'constructor').text, source),
        ...codeChildren(required(source, 'arguments')).map((argument) => context.get(argument)),
      ]),
    ]),
};
