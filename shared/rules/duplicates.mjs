import { RULE_IDS } from '../policy.mjs';
import { addMetric, hash, nextOccurrence, positiveInteger } from './finding-helpers.mjs';

function duplicateMessage(other, lines) {
  const place =
    positiveInteger(other.line) === undefined ? other.file : `${other.file}:${String(other.line)}`;
  const size = positiveInteger(lines) === undefined ? '' : ` (${String(lines)} lines)`;
  return `This code repeats ${place}${size}. Keep one copy and call it from both places.`;
}

function clonedRange(side, lines) {
  const startLine = positiveInteger(side.line);
  if (startLine === undefined) {
    return undefined;
  }
  const endLine = positiveInteger(side.endLine) ?? startLine + (lines ?? 0) - 1;
  return endLine < startLine ? undefined : { path: side.file, startLine, endLine };
}

function keptLines(sides, lines) {
  const ranges = sides.map((side) => clonedRange(side, positiveInteger(lines)));
  return ranges.includes(undefined) ? {} : { mustKeepUnchangedLines: ranges };
}

function sizeRatchet(pair, clone, sides) {
  const size = positiveInteger(clone.tokens) ?? positiveInteger(clone.lines);
  return size === undefined
    ? {}
    : {
        ratchet: {
          key: `pair:${pair}:clone`,
          value: size,
          divisible: true,
          ...keptLines(sides, clone.lines),
        },
      };
}

export function evaluateDuplicates(clones, analyzerName) {
  const findings = [];
  const pairOccurrences = new Map();
  const fragmentOccurrences = new Map();
  for (const clone of clones) {
    const sides = [clone.first, clone.second].sort((left, right) =>
      left.file.localeCompare(right.file),
    );
    const pair = sides.map((side) => side.file).join('|');
    const pairKey = sides.map((side) => side.file).join('\0');
    const fragment = hash(clone.fragment ?? '');
    const occurrence = nextOccurrence(pairOccurrences, pairKey);
    const fragmentOccurrence = nextOccurrence(fragmentOccurrences, `${pairKey}\0${fragment}`);
    findings.push({
      tool: analyzerName,
      rule: RULE_IDS.duplicateClone,
      path: sides[0].file,
      identity: `pair:${pair}:fragment:${fragment}:occurrence:${String(fragmentOccurrence)}`,
      message: duplicateMessage(sides[1], clone.lines),
      classification: 'enforceable',
      ...(positiveInteger(sides[0].line) === undefined
        ? {}
        : { location: { line: sides[0].line } }),
      ...sizeRatchet(pair, clone, sides),
    });
    for (const metricName of ['lines', 'tokens']) {
      addMetric(findings, {
        analyzerName,
        rule: 'duplicate-clone-size',
        path: sides[0].file,
        identity: `pair:${pair}:occurrence:${String(occurrence)}:${metricName}`,
        message: `Duplicate with ${sides[1].file}`,
        metricName,
        value: clone[metricName],
        line: sides[0].line,
      });
    }
  }
  return findings;
}
