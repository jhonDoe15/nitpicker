import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';

const SEGMENT_WITH_SOURCE_LENGTH = 4;

function lineStarts(code) {
  const starts = [0];
  for (const match of code.matchAll(/\n/gu)) {
    starts.push(match.index + 1);
  }
  return starts;
}

function mappedOffsets(code, sourceMap) {
  const starts = lineStarts(code);
  return new Set(
    decodedMappings(new TraceMap(sourceMap)).flatMap((segments, line) =>
      segments
        .filter((segment) => segment.length >= SEGMENT_WITH_SOURCE_LENGTH)
        .map(([column]) => starts[line] + column),
    ),
  );
}

function mappedStartEnd(node) {
  return node.type === 'IfStatement' ? node.test.start : node.start;
}

export function unmappedNodeFilter(code, sourceMap) {
  const offsets = mappedOffsets(code, sourceMap);
  return (node) => {
    const length = mappedStartEnd(node) - node.start + 1;
    return !Array.from({ length }, (_, index) => node.start + index).some((offset) =>
      offsets.has(offset),
    );
  };
}
