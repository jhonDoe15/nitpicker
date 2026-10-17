import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';

const SEGMENT_WITH_SOURCE_LENGTH = 4;
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const NAME_HELPER = '__name';
const LEADING_WORD = /^[\w$]*/u;

function lineStarts(code) {
  const starts = [0];
  for (const match of code.matchAll(/\n/gu)) {
    starts.push(match.index + 1);
  }
  return starts;
}

function sourcedSegments(code, map) {
  const starts = lineStarts(code);
  return decodedMappings(map)
    .flatMap((segments, line) =>
      segments
        .filter((segment) => segment.length >= SEGMENT_WITH_SOURCE_LENGTH)
        .map(([column, source, originalLine, originalColumn]) => ({
          offset: starts[line] + column,
          source,
          originalLine,
          originalColumn,
        })),
    )
    .toSorted((left, right) => left.offset - right.offset);
}

function firstAtOrAfter(segments, target) {
  const steps = Math.ceil(Math.log2(segments.length + 1));
  const { low } = Array.from({ length: steps }).reduce(
    (range) => {
      const middle = Math.floor((range.low + range.high) / 2);
      return segments[middle]?.offset < target
        ? { low: middle + 1, high: range.high }
        : { low: range.low, high: middle };
    },
    { low: 0, high: segments.length },
  );
  return segments[low];
}

function headEnd(node) {
  if (node.type === 'IfStatement') {
    return node.test.end;
  }
  const fn = FUNCTION_TYPES.has(node.type) ? node : node.value;
  return FUNCTION_TYPES.has(fn?.type) ? fn.body.start + 1 : node.end;
}

function isNameHelperCall(expression) {
  return (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Identifier' &&
    expression.callee.name === NAME_HELPER
  );
}

function isNameExport(expression) {
  return (
    expression.type === 'AssignmentExpression' &&
    expression.left.type === 'MemberExpression' &&
    expression.left.object.type !== 'ThisExpression' &&
    expression.left.property.type === 'Identifier' &&
    expression.right.type === 'Identifier' &&
    expression.left.property.name === expression.right.name
  );
}

function isPlumbingShape(node) {
  return (
    node.type === 'ExpressionStatement' &&
    (isNameHelperCall(node.expression) || isNameExport(node.expression))
  );
}

function isEnumMember(statement, enumName) {
  if (statement.type === 'ReturnStatement') {
    return statement.argument?.name === enumName;
  }
  const target = statement.expression?.left;
  return (
    statement.type === 'ExpressionStatement' &&
    target?.type === 'MemberExpression' &&
    target.computed &&
    target.object.name === enumName
  );
}

function isEnumCall(node) {
  const [parameter] = node.callee?.params ?? [];
  const [argument] = node.arguments ?? [];
  return (
    node.type === 'CallExpression' &&
    FUNCTION_TYPES.has(node.callee.type) &&
    node.callee.body.type === 'BlockStatement' &&
    parameter?.type === 'Identifier' &&
    argument?.type === 'LogicalExpression' &&
    node.callee.body.body.every((statement) => isEnumMember(statement, parameter.name))
  );
}

function enumArguments(ast) {
  const found = new Set();
  const pending = [ast];
  for (const node of pending) {
    if (isEnumCall(node)) {
      found.add(node.arguments[0]);
    }
    const children = Object.values(node).flatMap((value) =>
      Array.isArray(value) ? value : [value],
    );
    pending.push(...children.filter((child) => typeof child?.type === 'string'));
  }
  return found;
}

function originalLines(map) {
  const lines = (map.sourcesContent ?? []).map((content) => content?.split('\n'));
  return ({ source, originalLine, originalColumn }) =>
    lines[source]?.[originalLine]?.slice(originalColumn);
}

export function unmappedNodeFilter({ code, ast, sourceMap }) {
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
    const written = LEADING_WORD.exec(originalAt(first) ?? '')[0];
    return isPlumbingShape(node) && written !== LEADING_WORD.exec(code.slice(first.offset))[0];
  };
}
