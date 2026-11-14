import {
  NONE,
  at,
  codeChildren,
  expression,
  field,
  listItems,
  literal,
  numberText,
  operatorOf,
  typeNode,
} from './nodes.mjs';
import { parametersOf } from './signature.mjs';

const INDEX = 'index';
const OPERAND = 'operand';

const NUMBER_KIND = 'number';
const RECEIVE = '<-recv';
const SEND = '<-send';
const BASIC_TYPES =
  /^(?:bool|string|byte|rune|u?int(?:8|16|32|64)?|uintptr|float(?:32|64)|complex(?:64|128))$/u;
const UNARY_RENAMES = new Map([['^', '~']]);

function operation(source, context) {
  return at({ kind: 'binary', value: operatorOf(source) }, source, [
    context.get(field(source, 'left')),
    context.get(field(source, 'right')),
  ]);
}

export function channelCall(operation, source, children) {
  const callee = {
    ...at('name', source),
    kind: 'name',
    binding: 'free',
    value: operation,
    text: operation,
  };
  return at('call', source, [callee, ...children]);
}

function unary(source, context) {
  const operand = context.get(field(source, OPERAND));
  const operator = operatorOf(source);
  if (operator === '<-') {
    return channelCall(RECEIVE, source, [operand]);
  }
  if (operator === '&') {
    return expression('address', source, [operand]);
  }
  if (operator === '*') {
    return at(INDEX, source, [
      operand,
      at({ kind: 'literal', literal: 'deref', value: '*' }, source),
    ]);
  }
  return at({ kind: 'unary', value: UNARY_RENAMES.get(operator) ?? operator }, source, [operand]);
}

function argumentsOf(source, context) {
  return listItems(field(source, 'arguments')).map((argument) => context.get(argument));
}

function call(source, context) {
  const callee = context.get(field(source, 'function'));
  const args = argumentsOf(source, context);
  if (
    callee.kind === 'name' &&
    callee.binding === 'free' &&
    callee.value === callee.text &&
    BASIC_TYPES.test(callee.text) &&
    args.length === 1
  ) {
    return expression('cast', source, [at({ kind: 'type', value: callee.text }, source), ...args]);
  }
  return at('call', source, [callee, ...args]);
}

function optional(source, name, context) {
  const part = field(source, name);
  return part === undefined ? NONE : context.get(part);
}

function slice(source, context) {
  return expression('slice', source, [
    context.get(field(source, OPERAND)),
    optional(source, 'start', context),
    optional(source, 'end', context),
    optional(source, 'capacity', context),
  ]);
}

function elements(source, context) {
  return listItems(source).map((element) => context.get(element));
}

function literalValue(source, context) {
  return expression('composite', source, [NONE, ...elements(source, context)]);
}

function composite(source, context) {
  const body = field(source, 'body');
  return expression('composite', source, [
    typeNode(field(source, 'type')),
    ...(body === undefined ? [] : elements(body, context)),
  ]);
}

function funcLiteral(source, context) {
  const body = context.get(field(source, 'body'));
  return at('lambda', source, [parametersOf(source, context), body]);
}

function wrapped(source, context) {
  return context.get(codeChildren(source)[0]);
}

export const EXPRESSIONS = {
  identifier: (source, context) => context.name(source),
  true: literal('boolean'),
  false: literal('boolean'),
  nil: literal('null', () => 'null'),
  int_literal: literal(NUMBER_KIND, numberText),
  float_literal: literal(NUMBER_KIND, numberText),
  rune_literal: literal('char'),
  interpreted_string_literal: literal('string'),
  raw_string_literal: literal('string'),
  parenthesized_expression: wrapped,
  selector_expression: (source, context) =>
    at({ kind: 'member', value: field(source, 'field').text }, source, [
      context.get(field(source, OPERAND)),
    ]),
  call_expression: call,
  index_expression: (source, context) =>
    at(INDEX, source, [context.get(field(source, OPERAND)), context.get(field(source, INDEX))]),
  slice_expression: slice,
  type_assertion_expression: (source, context) =>
    expression('assert', source, [
      typeNode(field(source, 'type')),
      context.get(field(source, OPERAND)),
    ]),
  type_conversion_expression: (source, context) =>
    expression('cast', source, [
      typeNode(field(source, 'type')),
      context.get(field(source, OPERAND)),
    ]),
  composite_literal: composite,
  literal_value: literalValue,
  keyed_element: (source, context) =>
    expression('key', source, [
      context.get(field(source, 'key')),
      context.get(field(source, 'value')),
    ]),
  literal_element: wrapped,
  variadic_argument: (source, context) => expression('spread', source, [wrapped(source, context)]),
  func_literal: funcLiteral,
  unary_expression: unary,
  binary_expression: operation,
};

export { SEND };
