import { listOf, statementsOf } from '../../../../../shared/near-duplicates/unit-parts.mjs';
import { NONE, at, codeChildren, field, fields, typeNode } from './nodes.mjs';

function blockOf(source, context) {
  if (source === undefined) {
    return NONE;
  }
  return source.type === 'block'
    ? context.get(source)
    : at('block', source, statementsOf(source, context));
}

function grouped(value, source, children) {
  return at({ kind: 'statement', value }, source, children);
}

function optionalChild(source, context) {
  const [child] = codeChildren(source);
  return child === undefined ? NONE : context.get(child);
}

function declareOf(declarator, type, context) {
  const value = field(declarator, 'value');
  return at('declare', declarator, [
    type,
    context.get(field(declarator, 'name')),
    value === undefined ? NONE : context.get(value),
  ]);
}

function declarationsOf(source, context) {
  const type = typeNode(field(source, 'type'));
  return fields(source, 'declarator').map((declarator) => declareOf(declarator, type, context));
}

function forPart(sources, context) {
  return sources.flatMap((source) =>
    source.type === 'local_variable_declaration'
      ? declarationsOf(source, context)
      : [at('evaluate', source, [context.get(source)])],
  );
}

function labelled(kind, source) {
  const [label] = codeChildren(source);
  return at({ kind, ...(label === undefined ? {} : { value: label.text }) }, source);
}

function switchBody(source, context) {
  return codeChildren(field(source, 'body')).map((part) => {
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
        ? rest.map((child) => context.get(child))
        : [at('block', part, listOf(rest, context))];
    return grouped(part.type === 'switch_rule' ? 'rule' : 'case', part, [...tests, ...body.flat()]);
  });
}

function switchOf(source, context) {
  const kind =
    source.parent?.type === 'block' || source.parent?.type === 'expression_statement'
      ? 'statement'
      : 'expression';
  return at({ kind, value: 'switch' }, source, [
    context.get(field(source, 'condition')),
    ...switchBody(source, context),
  ]);
}

function catchOf(clause, context) {
  const parameter = codeChildren(clause).find((child) => child.type === 'catch_formal_parameter');
  const types = codeChildren(parameter).filter((child) => child.type === 'catch_type');
  return grouped('catch', clause, [
    ...types.map(typeNode),
    context.get(field(parameter, 'name')),
    blockOf(field(clause, 'body'), context),
  ]);
}

function tryParts(source, context) {
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

function resourceOf(resource, context) {
  const name = field(resource, 'name');
  if (name === undefined) {
    return at('evaluate', resource, [context.get(codeChildren(resource)[0])]);
  }
  return at('declare', resource, [
    typeNode(field(resource, 'type')),
    context.get(name),
    context.get(field(resource, 'value')),
  ]);
}

export const STATEMENTS = {
  block: (source, context) => at('block', source, listOf(codeChildren(source), context)),
  constructor_body: (source, context) => at('block', source, listOf(codeChildren(source), context)),
  local_variable_declaration: declarationsOf,
  expression_statement: (source, context) =>
    at('evaluate', source, [context.get(codeChildren(source)[0])]),
  if_statement: (source, context) =>
    at('if', source, [
      context.get(field(source, 'condition')),
      blockOf(field(source, 'consequence'), context),
      blockOf(field(source, 'alternative'), context),
    ]),
  return_statement: (source, context) => at('return', source, [optionalChild(source, context)]),
  throw_statement: (source, context) => at('throw', source, [optionalChild(source, context)]),
  break_statement: (source) => labelled('break', source),
  continue_statement: (source) => labelled('continue', source),
  for_statement: (source, context) =>
    at('for', source, [
      at('block', source, forPart(fields(source, 'init'), context)),
      field(source, 'condition') === undefined ? NONE : context.get(field(source, 'condition')),
      at('block', source, forPart(fields(source, 'update'), context)),
      blockOf(field(source, 'body'), context),
    ]),
  enhanced_for_statement: (source, context) =>
    at('foreach', source, [
      typeNode(field(source, 'type')),
      context.get(field(source, 'name')),
      context.get(field(source, 'value')),
      blockOf(field(source, 'body'), context),
    ]),
  while_statement: (source, context) =>
    at('while', source, [
      context.get(field(source, 'condition')),
      blockOf(field(source, 'body'), context),
    ]),
  do_statement: (source, context) =>
    at('do', source, [
      blockOf(field(source, 'body'), context),
      context.get(field(source, 'condition')),
    ]),
  switch_expression: switchOf,
  try_statement: (source, context) =>
    grouped('try', source, [blockOf(field(source, 'body'), context), ...tryParts(source, context)]),
  try_with_resources_statement: (source, context) =>
    grouped('try', source, [
      ...codeChildren(field(source, 'resources')).map((resource) => resourceOf(resource, context)),
      blockOf(field(source, 'body'), context),
      ...tryParts(source, context),
    ]),
  labeled_statement: (source, context) => {
    const [label, body] = codeChildren(source);
    return grouped(`label:${label.text}`, source, [blockOf(body, context)]);
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
    at('evaluate', source, [
      at('call', source, [
        context.name(field(source, 'constructor').text, source),
        ...codeChildren(field(source, 'arguments')).map((argument) => context.get(argument)),
      ]),
    ]),
};
