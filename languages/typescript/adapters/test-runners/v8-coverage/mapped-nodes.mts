import type {
  AnyNode,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  Literal,
  MemberExpression,
  Program,
  Statement,
} from 'acorn';
import {
  type EncodedSourceMap,
  type SourceMapSegment,
  TraceMap,
  decodedMappings,
} from '@jridgewell/trace-mapping';
import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

type SourcedSegment = Exclude<SourceMapSegment, [number]>;

type Segment = {
  readonly offset: number;
  readonly source: number;
  readonly originalLine: number;
  readonly originalColumn: number;
};

type Range = { readonly low: number; readonly high: number };

export type MappedCode = {
  readonly code: string;
  readonly ast: Program;
  readonly sourceMap: EncodedSourceMap;
};

const SEGMENT_WITH_SOURCE_LENGTH = 4;
const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const NAME_HELPER = '__name';
const LEADING_WORD = /^[\w$]*/u;

function lineStarts(code: string): number[] {
  const starts = [0];
  for (const match of code.matchAll(/\n/gu)) {
    starts.push(match.index + 1);
  }
  return starts;
}

function hasSource(segment: SourceMapSegment): segment is SourcedSegment {
  return segment.length >= SEGMENT_WITH_SOURCE_LENGTH;
}

function sourcedSegments(code: string, map: TraceMap): Segment[] {
  const starts = lineStarts(code);
  return decodedMappings(map)
    .flatMap((segments, line) =>
      segments.filter(hasSource).map(([column, source, originalLine, originalColumn]) => ({
        offset: (starts[line] ?? 0) + column,
        source,
        originalLine,
        originalColumn,
      })),
    )
    .toSorted((left, right) => left.offset - right.offset);
}

function firstAtOrAfter(segments: readonly Segment[], target: number): Segment | undefined {
  const steps = Math.ceil(Math.log2(segments.length + 1));
  const { low } = Array.from({ length: steps }).reduce<Range>(
    (range) => {
      const middle = Math.floor((range.low + range.high) / 2);
      return (segments[middle]?.offset ?? Infinity) < target
        ? { low: middle + 1, high: range.high }
        : { low: range.low, high: middle };
    },
    { low: 0, high: segments.length },
  );
  return segments[low];
}

function isFunctionNode(value: unknown): value is FunctionNode {
  const type = fieldOf(value, 'type');
  return typeof type === 'string' && FUNCTION_TYPES.has(type);
}

function headEnd(node: AnyNode): number {
  if (node.type === 'IfStatement') {
    return node.test.end;
  }
  const fn = isFunctionNode(node) ? node : fieldOf(node, 'value');
  return isFunctionNode(fn) ? fn.body.start + 1 : node.end;
}

function isNameHelperCall(expression: Expression | Literal): boolean {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Identifier' &&
    expression.callee.name === NAME_HELPER
  );
}

function isNameExport(expression: Expression | Literal): boolean {
  return (
    expression.type === 'AssignmentExpression' &&
    expression.left.type === 'MemberExpression' &&
    expression.left.object.type !== 'ThisExpression' &&
    expression.left.property.type === 'Identifier' &&
    expression.right.type === 'Identifier' &&
    expression.left.property.name === expression.right.name
  );
}

function isPlumbingShape(node: AnyNode): boolean {
  return (
    node.type === 'ExpressionStatement' &&
    (isNameHelperCall(node.expression) || isNameExport(node.expression))
  );
}

function isMemberExpression(value: unknown): value is MemberExpression {
  return fieldOf(value, 'type') === 'MemberExpression';
}

function isEnumMember(statement: Statement, enumName: string): boolean {
  if (statement.type === 'ReturnStatement') {
    return fieldOf(statement.argument, 'name') === enumName;
  }
  const target = fieldOf(fieldOf(statement, 'expression'), 'left');
  return (
    statement.type === 'ExpressionStatement' &&
    isMemberExpression(target) &&
    target.computed &&
    fieldOf(target.object, 'name') === enumName
  );
}

function isEnumCall(node: AnyNode): node is CallExpression {
  if (node.type !== 'CallExpression' || !isFunctionNode(node.callee)) {
    return false;
  }
  const { body, params } = node.callee;
  const [parameter] = params;
  const [argument] = node.arguments;
  return (
    body.type === 'BlockStatement' &&
    parameter?.type === 'Identifier' &&
    argument?.type === 'LogicalExpression' &&
    body.body.every((statement) => isEnumMember(statement, parameter.name))
  );
}

function isAstNode(value: unknown): value is AnyNode {
  return typeof fieldOf(value, 'type') === 'string';
}

function enumArguments(ast: Program): Set<AnyNode> {
  const found = new Set<AnyNode>();
  const pending: AnyNode[] = [ast];
  for (const node of pending) {
    const [argument] = isEnumCall(node) ? node.arguments : [];
    if (argument !== undefined) {
      found.add(argument);
    }
    const children = Object.values(node).flatMap((value: unknown) =>
      Array.isArray(value) ? listOf(value) : [value],
    );
    pending.push(...children.filter(isAstNode));
  }
  return found;
}

function originalLines(map: TraceMap): (segment: Segment) => string | undefined {
  const lines = (map.sourcesContent ?? []).map((content) => content?.split('\n'));
  return ({ source, originalLine, originalColumn }) =>
    lines[source]?.[originalLine]?.slice(originalColumn);
}

function leadingWord(text: string): string | undefined {
  return LEADING_WORD.exec(text)?.[0];
}

export function unmappedNodeFilter({
  code,
  ast,
  sourceMap,
}: MappedCode): (node: AnyNode) => boolean {
  const map = new TraceMap(sourceMap);
  const segments = sourcedSegments(code, map);
  const originalAt = originalLines(map);
  const enumHelpers = enumArguments(ast);
  return (node) => {
    if (enumHelpers.has(node)) {
      return true;
    }
    const first = firstAtOrAfter(segments, node.start);
    if (first === undefined || first.offset >= headEnd(node)) {
      return true;
    }
    const written = leadingWord(originalAt(first) ?? '');
    return isPlumbingShape(node) && written !== leadingWord(code.slice(first.offset));
  };
}
