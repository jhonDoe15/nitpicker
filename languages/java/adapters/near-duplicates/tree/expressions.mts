import type { Node } from 'web-tree-sitter';
import type { BaseContext, Converter, PlacedNode, ShapeNode } from '../jvm-types.mts';
import {
  NONE,
  at,
  codeChildren,
  field,
  inner,
  literal,
  numberText,
  opaque,
  present,
  required,
  typeNode,
} from './nodes.mts';

const NUMBER_KIND = 'number';
const PARAMETER_KIND = 'parameter';

function operatorOf(source: Node): string | undefined {
  return field(source, 'operator')?.type;
}

function operation(kind: string): Converter {
  return (source, context) =>
    at({ kind, value: operatorOf(source) }, source, [
      context.get(field(source, 'left')),
      context.get(field(source, 'right')),
    ]);
}

function argumentsOf(source: Node, context: BaseContext): ShapeNode[] {
  const list = field(source, 'arguments');
  return list === undefined ? [] : codeChildren(list).map((argument) => context.get(argument));
}

function invocationOf(source: Node, context: BaseContext): PlacedNode {
  const object = field(source, 'object');
  const name = required(source, 'name');
  const callee =
    object === undefined
      ? context.method(name.text, name)
      : at({ kind: 'member', value: name.text }, source, [context.get(object)]);
  return at('call', source, [callee, ...argumentsOf(source, context)]);
}

function creationOf(source: Node, context: BaseContext): PlacedNode {
  const body = codeChildren(source).find((child) => child.type === 'class_body');
  if (body !== undefined) {
    return at({ kind: 'expression', value: `anonymous:${required(source, 'type').text}` }, source, [
      ...argumentsOf(source, context),
      opaque('expression', body),
    ]);
  }
  return at('new', source, [typeNode(field(source, 'type')), ...argumentsOf(source, context)]);
}

function updateOf(source: Node): { operand: Node | undefined; value: string } {
  const first = present(source.children[0]);
  const operand = codeChildren(source)[0];
  const prefix = first.type === '++' || first.type === '--';
  const operator = prefix ? first.type : present(source.children.at(-1)).type;
  return { operand, value: `${prefix ? 'prefix' : 'postfix'}${operator}` };
}

function lambdaParameters(source: Node, context: BaseContext): PlacedNode {
  const parameters = required(source, 'parameters');
  const list = parameters.type === 'identifier' ? [parameters] : codeChildren(parameters);
  return at(
    'parameters',
    parameters,
    list.map((parameter) =>
      parameter.type === 'identifier'
        ? at(PARAMETER_KIND, parameter, [NONE, context.get(parameter)])
        : context.get(parameter),
    ),
  );
}

export function lambdaOf(source: Node, context: BaseContext): PlacedNode {
  return at('lambda', source, [
    lambdaParameters(source, context),
    context.get(field(source, 'body')),
  ]);
}

function instanceOf(source: Node, context: BaseContext): PlacedNode {
  const name = field(source, 'name');
  const pattern = field(source, 'pattern');
  const right = field(source, 'right');
  const target =
    pattern === undefined
      ? typeNode(right)
      : at(
          { kind: 'expression', value: `pattern:${pattern.text.replaceAll(/\s+/gu, ' ')}` },
          pattern,
        );
  const tested =
    name === undefined
      ? target
      : at({ kind: 'expression', value: 'binding' }, source, [target, context.get(name)]);
  return at({ kind: 'binary', value: 'instanceof' }, source, [
    context.get(field(source, 'left')),
    tested,
  ]);
}

function grouped(value: string): Converter {
  return (source, context) =>
    at(
      { kind: 'expression', value },
      source,
      codeChildren(source).map((child) => context.get(child)),
    );
}

export const EXPRESSIONS: Readonly<Record<string, Converter>> = {
  identifier: (source, context) => context.name(source.text, source),
  decimal_integer_literal: literal(NUMBER_KIND, numberText),
  hex_integer_literal: literal(NUMBER_KIND, numberText),
  octal_integer_literal: literal(NUMBER_KIND, numberText),
  binary_integer_literal: literal(NUMBER_KIND, numberText),
  decimal_floating_point_literal: literal(NUMBER_KIND, numberText),
  hex_floating_point_literal: literal(NUMBER_KIND, numberText),
  string_literal: literal('string'),
  character_literal: literal('char'),
  true: literal('boolean'),
  false: literal('boolean'),
  null_literal: literal('null'),
  this: (source) => at('this', source),
  super: (source, context) => context.name('super', source),
  field_access: (source, context) =>
    at({ kind: 'member', value: required(source, 'field').text }, source, [
      context.get(field(source, 'object')),
    ]),
  method_invocation: invocationOf,
  object_creation_expression: creationOf,
  array_access: (source, context) =>
    at('index', source, [context.get(field(source, 'array')), context.get(field(source, 'index'))]),
  binary_expression: operation('binary'),
  unary_expression: (source, context) =>
    at({ kind: 'unary', value: operatorOf(source) }, source, [
      context.get(field(source, 'operand')),
    ]),
  update_expression: (source, context) => {
    const { operand, value } = updateOf(source);
    return at({ kind: 'update', value }, source, [context.get(operand)]);
  },
  assignment_expression: operation('assign'),
  ternary_expression: (source, context) =>
    at('conditional', source, [
      context.get(field(source, 'condition')),
      context.get(field(source, 'consequence')),
      context.get(field(source, 'alternative')),
    ]),
  lambda_expression: lambdaOf,
  cast_expression: (source, context) =>
    at({ kind: 'expression', value: 'cast' }, source, [
      typeNode(field(source, 'type')),
      context.get(field(source, 'value')),
    ]),
  instanceof_expression: instanceOf,
  parenthesized_expression: inner,
  array_initializer: grouped('array'),
  array_creation_expression: (source, context) =>
    at({ kind: 'expression', value: 'new-array' }, source, [
      typeNode(field(source, 'type')),
      ...codeChildren(source)
        .slice(1)
        .map((child) => context.get(child)),
    ]),
  dimensions_expr: inner,
  class_literal: (source) =>
    at({ kind: 'expression', value: 'class' }, source, [typeNode(codeChildren(source)[0])]),
  formal_parameter: (source, context) =>
    at(PARAMETER_KIND, source, [
      typeNode(field(source, 'type')),
      context.get(field(source, 'name')),
    ]),
  spread_parameter: (source, context) => {
    const [type, found] = codeChildren(source).filter((child) => child.type !== 'modifiers');
    const declarator = present(found);
    const name = declarator.type === 'variable_declarator' ? field(declarator, 'name') : declarator;
    return at(PARAMETER_KIND, source, [
      typeNode(type),
      at({ kind: 'expression', value: 'rest' }, declarator, [context.get(name)]),
    ]);
  },
};
