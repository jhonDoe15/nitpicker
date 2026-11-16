import type { Node } from 'web-tree-sitter';
import type { KotlinContext, KotlinConverter, PlacedNode, ShapeNode } from '../jvm-types.mts';
import {
  at,
  codeChildren,
  field,
  inner,
  literal,
  numberText,
  opaque,
  present,
  textOf,
  typeNode,
} from '../tree/nodes.mts';
import { placedWithSnippet } from '../jvm-views.mts';
import { bodyOf } from './statements.mts';

const RIGHT_FIELD = 'right';
const STRING_KIND = 'string';
const NUMBER_KIND = 'number';
const BOOLEAN_KIND = 'boolean';

const KEYWORD_NAMES: Readonly<Record<string, (source: Node) => PlacedNode>> = {
  true: (source) => at({ kind: 'literal', literal: BOOLEAN_KIND, value: 'true' }, source),
  false: (source) => at({ kind: 'literal', literal: BOOLEAN_KIND, value: 'false' }, source),
  null: (source) => at({ kind: 'literal', literal: 'null', value: 'null' }, source),
  break: (source) => at('break', source),
  continue: (source) => at('continue', source),
};
const SIMPLE_TEMPLATE = /\$([A-Za-z_]\w*)/gu;

function operatorText(source: Node): string | undefined {
  const operator = field(source, 'operator');
  if (operator !== undefined) {
    return operator.type;
  }
  return source.children.find((child) => !child.isNamed)?.type;
}

function argumentOf(argument: Node, context: KotlinContext): ShapeNode {
  const parts = codeChildren(argument);
  const value = context.get(parts.at(-1));
  const spread = argument.children.some((child) => child.type === '*');
  if (parts.length > 1) {
    return at({ kind: 'expression', value: `argument:${present(parts[0]).text}` }, argument, [
      value,
    ]);
  }
  return spread ? at({ kind: 'expression', value: 'spread' }, argument, [value]) : value;
}

function argumentsOf(parts: readonly Node[], context: KotlinContext): ShapeNode[] {
  return parts.flatMap((part) => {
    if (part.type === 'value_arguments') {
      return codeChildren(part).map((argument) => argumentOf(argument, context));
    }
    if (part.type === 'annotated_lambda') {
      const lambda = codeChildren(part).find((child) => child.type === 'lambda_literal');
      return [context.get(lambda)];
    }
    return [];
  });
}

function calleeOf(callee: Node, context: KotlinContext): ShapeNode {
  if (callee.type === 'identifier') {
    return context.method(callee.text, callee);
  }
  return context.get(callee);
}

const PREFIX_OPERATORS = new Set(['!', '-', '+']);
const CALLEES = new Set(['identifier', 'navigation_expression']);

function prefixedOperand(callee: Node | undefined): Node | undefined {
  if (callee?.type !== 'unary_expression' || !PREFIX_OPERATORS.has(operatorText(callee) ?? '')) {
    return undefined;
  }
  const operand = field(callee, 'argument') ?? codeChildren(callee)[0];
  return operand !== undefined && CALLEES.has(operand.type) ? operand : undefined;
}

function prefixedCall(
  source: Node,
  operand: Node,
  { parts, context }: { parts: readonly Node[]; context: KotlinContext },
): PlacedNode {
  const call = at('call', source, [calleeOf(operand, context), ...argumentsOf(parts, context)]);
  const text = source.text.slice(operand.startIndex - source.startIndex);
  return placedWithSnippet(call, text);
}

function callOf(source: Node, context: KotlinContext): PlacedNode {
  const [callee, ...parts] = codeChildren(source);
  const operand = prefixedOperand(callee);
  if (operand !== undefined && !parts.some((part) => part.type === 'type_arguments')) {
    const call = prefixedCall(source, operand, { parts, context });
    return at({ kind: 'unary', value: operatorText(present(callee)) }, source, [call]);
  }
  const typeArguments = parts.find((part) => part.type === 'type_arguments');
  const call = at('call', source, [
    calleeOf(present(callee), context),
    ...argumentsOf(parts, context),
  ]);
  return typeArguments === undefined
    ? call
    : { ...call, children: [...call.children, typeNode(typeArguments)] };
}

function navigationOf(source: Node, context: KotlinContext): PlacedNode {
  const [receiver, found] = codeChildren(source);
  const member = present(found);
  const safe = source.children.some((child) => child.type === '?.');
  const value = member.type === 'identifier' ? member.text : textOf(member);
  const unstable = context.unstable(value);
  return at({ kind: 'member', value: safe ? `?.${value}` : value, ...unstable }, source, [
    context.get(receiver),
  ]);
}

function unaryOf(source: Node, context: KotlinContext): PlacedNode {
  const argument = field(source, 'argument') ?? codeChildren(source)[0];
  const operator = operatorText(source);
  if (operator === '++' || operator === '--') {
    const prefix = present(source.children[0]).type === operator;
    return at({ kind: 'update', value: `${prefix ? 'prefix' : 'postfix'}${operator}` }, source, [
      context.get(argument),
    ]);
  }
  if (operator === '!!') {
    return at({ kind: 'expression', value: '!!' }, source, [context.get(argument)]);
  }
  return at({ kind: 'unary', value: operator }, source, [context.get(argument)]);
}

function binaryOf(source: Node, context: KotlinContext): PlacedNode {
  return at({ kind: 'binary', value: operatorText(source) }, source, [
    context.get(field(source, 'left')),
    context.get(field(source, RIGHT_FIELD)),
  ]);
}

function typeTestOf(source: Node, context: KotlinContext): PlacedNode {
  return at(
    { kind: 'binary', value: source.children.find((child) => !child.isNamed)?.type },
    source,
    [context.get(field(source, 'left')), typeNode(field(source, RIGHT_FIELD))],
  );
}

function castOf(source: Node, context: KotlinContext): PlacedNode {
  return at(
    { kind: 'expression', value: source.children.find((child) => !child.isNamed)?.type },
    source,
    [typeNode(field(source, RIGHT_FIELD)), context.get(field(source, 'left'))],
  );
}

function infixOf(source: Node, context: KotlinContext): PlacedNode {
  const [left, found, right] = codeChildren(source);
  const name = present(found);
  return at('call', source, [
    at({ kind: 'member', value: name.text }, name, [context.get(left)]),
    context.get(right),
  ]);
}

function lambdaParameters(source: Node, context: KotlinContext): PlacedNode {
  const list = codeChildren(source).find((child) => child.type === 'lambda_parameters');
  const parameters = list === undefined ? [] : codeChildren(list);
  return at(
    'parameters',
    list ?? source,
    parameters.map((parameter) => {
      const parts = codeChildren(parameter);
      const name =
        parameter.type === 'multi_variable_declaration'
          ? at(
              { kind: 'expression', value: 'destructure' },
              parameter,
              parts.map((part) => context.get(codeChildren(part)[0])),
            )
          : context.get(parts[0]);
      return at('parameter', parameter, [
        typeNode(parts.find((part) => part.type.endsWith('_type'))),
        name,
      ]);
    }),
  );
}

function lambdaOf(source: Node, context: KotlinContext): PlacedNode {
  const statements = codeChildren(source).filter((child) => child.type !== 'lambda_parameters');
  const [only] = statements;
  const body =
    statements.length === 1 && !context.isStatementType(present(only))
      ? context.get(only)
      : at(
          'block',
          source,
          statements.flatMap((statement) => bodyOf(statement, context).children),
        );
  return at('lambda', source, [lambdaParameters(source, context), body]);
}

function contentParts(text: string, source: Node, context: KotlinContext): ShapeNode[] {
  const parts: ShapeNode[] = [];
  let last = 0;
  for (const match of text.matchAll(SIMPLE_TEMPLATE)) {
    parts.push(
      at({ kind: 'literal', literal: STRING_KIND, value: text.slice(last, match.index) }, source),
    );
    parts.push(context.name(present(match[1]), source));
    last = match.index + match[0].length;
  }
  return [...parts, at({ kind: 'literal', literal: STRING_KIND, value: text.slice(last) }, source)];
}

function stringOf(source: Node, context: KotlinContext): PlacedNode {
  const children = codeChildren(source);
  if (children.every((child) => child.type === 'string_content') && !source.text.includes('$')) {
    return at({ kind: 'literal', literal: STRING_KIND, value: source.text }, source);
  }
  const pieces: ShapeNode[] = [];
  let content = '';
  for (const child of children) {
    if (child.type === 'string_content' || child.type === 'escape_sequence') {
      content += child.text;
    } else {
      pieces.push(...contentParts(content, source, context), context.get(codeChildren(child)[0]));
      content = '';
    }
  }
  const parts = [...pieces, ...contentParts(content, source, context)].filter(
    (part) => part.kind !== 'literal' || part.value !== '',
  );
  return at({ kind: 'expression', value: 'template' }, source, parts);
}

export const EXPRESSIONS: Readonly<Record<string, KotlinConverter>> = {
  identifier: (source, context) =>
    KEYWORD_NAMES[source.text]?.(source) ?? context.name(source.text, source),
  number_literal: literal(NUMBER_KIND, numberText),
  float_literal: literal(NUMBER_KIND, numberText),
  hex_literal: literal(NUMBER_KIND, numberText),
  bin_literal: literal(NUMBER_KIND, numberText),
  unsigned_literal: literal(NUMBER_KIND, numberText),
  long_literal: literal(NUMBER_KIND, numberText),
  boolean_literal: literal(BOOLEAN_KIND),
  null_literal: literal('null'),
  character_literal: literal('char'),
  string_literal: stringOf,
  multiline_string_literal: stringOf,
  this_expression: (source) => at('this', source),
  super_expression: (source, context) => context.name('super', source),
  navigation_expression: navigationOf,
  call_expression: callOf,
  index_expression: (source, context) =>
    at(
      'index',
      source,
      codeChildren(source).map((child) => context.get(child)),
    ),
  binary_expression: binaryOf,
  unary_expression: unaryOf,
  in_expression: (source, context) =>
    at({ kind: 'binary', value: source.children.find((child) => !child.isNamed)?.type }, source, [
      context.get(field(source, 'left')),
      context.get(field(source, RIGHT_FIELD)),
    ]),
  is_expression: typeTestOf,
  as_expression: castOf,
  range_expression: (source, context) =>
    at(
      { kind: 'binary', value: source.children.find((child) => !child.isNamed)?.type },
      source,
      codeChildren(source).map((child) => context.get(child)),
    ),
  range_test: (source, context) =>
    at(
      { kind: 'expression', value: source.children.find((child) => !child.isNamed)?.type },
      source,
      [inner(source, context)],
    ),
  type_test: (source) =>
    at(
      { kind: 'expression', value: source.children.find((child) => !child.isNamed)?.type },
      source,
      [typeNode(codeChildren(source)[0])],
    ),
  infix_expression: infixOf,
  parenthesized_expression: inner,
  lambda_literal: lambdaOf,
  callable_reference: (source) =>
    at({ kind: 'expression', value: `reference:${textOf(source)}` }, source),
  object_literal: (source) => opaque('expression', source),
  anonymous_function: (source) => opaque('expression', source),
  parameter: (source, context) => {
    const parts = codeChildren(source).filter((child) => child.type !== 'parameter_modifiers');
    return at('parameter', source, [
      typeNode(parts.find((part) => part.type.endsWith('_type'))),
      context.get(parts[0]),
    ]);
  },
};
