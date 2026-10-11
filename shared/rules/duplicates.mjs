// Duplicate-code findings, from neutral inputs.
//
// Input: a list of clones, each
//   {
//     first:  { file: string, line?: number },   // project-relative, forward-slash paths
//     second: { file: string, line?: number },
//     fragment?: string,                          // the cloned text (hashed into the identity)
//     lines?: number, tokens?: number,            // size of the clone
//   }
// The two sides are ordered by path, so the same pair gives the same finding either way round.
// Identity is the file pair, a hash of the fragment and the n-th occurrence of that pair, never a
// line number. Each clone is one enforceable `duplicate-clone` plus descriptive size metrics.

import { RULE_IDS } from '../policy.mjs';
import { addMetric, hash, nextOccurrence, positiveInteger } from './finding-helpers.mjs';

function duplicateMessage(other, lines) {
  const place =
    positiveInteger(other.line) === undefined ? other.file : `${other.file}:${String(other.line)}`;
  const size = positiveInteger(lines) === undefined ? '' : ` (${String(lines)} lines)`;
  return `This code repeats ${place}${size}. Keep one copy and call it from both places.`;
}

export function evaluateDuplicates(clones, analyzerName) {
  const findings = [];
  const occurrences = new Map();
  for (const clone of clones) {
    const sides = [clone.first, clone.second].sort((left, right) =>
      left.file.localeCompare(right.file),
    );
    const pair = sides.map((side) => side.file).join('|');
    const occurrence = nextOccurrence(occurrences, sides.map((side) => side.file).join('\0'));
    findings.push({
      tool: analyzerName,
      rule: RULE_IDS.duplicateClone,
      path: sides[0].file,
      identity: `pair:${pair}:fragment:${hash(clone.fragment ?? '')}:occurrence:${String(occurrence)}`,
      message: duplicateMessage(sides[1], clone.lines),
      classification: 'enforceable',
      ...(positiveInteger(sides[0].line) === undefined
        ? {}
        : { location: { line: sides[0].line } }),
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
