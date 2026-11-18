import type { Node } from 'web-tree-sitter';
import type { KotlinContext, PlacedNode, ShapeNode } from '../jvm-types.mts';
import { at, codeChildren, field, present, typeNode } from '../tree/nodes.mts';
import { placedWithSnippet } from '../jvm-views.mts';

export function operatorText(source: Node): string | undefined {
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

export function callOf(source: Node, context: KotlinContext): PlacedNode {
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
