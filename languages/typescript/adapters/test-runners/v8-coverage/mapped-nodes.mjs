import { TraceMap, decodedMappings } from '@jridgewell/trace-mapping';

function lineStarts(code) {
  const starts = [0];
  for (const match of code.matchAll(/\n/gu)) starts.push(match.index + 1);
  return starts;
}

function mappedOffsets(code, sourceMap) {
  const starts = lineStarts(code);
  return decodedMappings(new TraceMap(sourceMap))
    .flatMap((segments, line) =>
      segments.filter((segment) => segment.length >= 4).map(([column]) => starts[line] + column),
    )
    .toSorted((left, right) => left - right);
}

function firstAtOrAfter(offsets, target) {
  const range = { low: 0, high: offsets.length };
  while (range.low < range.high) {
    const middle = Math.floor((range.low + range.high) / 2);
    if (offsets[middle] < target) range.low = middle + 1;
    else range.high = middle;
  }
  return offsets[range.low];
}

function mappedStartEnd(node) {
  return node.type === 'IfStatement' ? node.test.start : node.start;
}

export function unmappedNodeFilter(code, sourceMap) {
  const offsets = mappedOffsets(code, sourceMap);
  return (node) => {
    const mapped = firstAtOrAfter(offsets, node.start);
    return mapped === undefined || mapped > mappedStartEnd(node);
  };
}
