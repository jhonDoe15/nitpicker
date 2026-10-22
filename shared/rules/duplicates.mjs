import { RULE_IDS } from '../policy.mjs';
import { addMetric, hash, nextOccurrence, positiveInteger } from './finding-helpers.mjs';

function duplicateMessage(sides, lines) {
  const [first, other] = sides;
  const place =
    positiveInteger(other.line) === undefined ? other.file : `${other.file}:${String(other.line)}`;
  const size = positiveInteger(lines) === undefined ? '' : ` (${String(lines)} lines)`;
  const files = first.file === other.file ? first.file : `${first.file} or ${other.file}`;
  return `This code repeats ${place}${size}. Keep one copy and call it from both places. If the repetition is intended, add ${files} to "exclude" in nitpicker.config.json.`;
}

function cloneMetrics({ analyzerName, sides, clone, pair, occurrence }) {
  const metrics = [];
  for (const metricName of ['lines', 'tokens']) {
    addMetric(metrics, {
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
  return metrics;
}

const PAIR_END = /:(?:fragment|occurrence):/;
export const RENAMED_IDENTITY_PREFIX = 'renamed:';
const IDENTITY_KIND_PREFIXES = [RENAMED_IDENTITY_PREFIX, 'cpd:'];

export function clonePartnerPath(finding) {
  const prefix = `pair:${finding.path}|`;
  const kind = IDENTITY_KIND_PREFIXES.find((candidate) => finding.identity.startsWith(candidate));
  const identity = finding.identity.slice(kind?.length ?? 0);
  if (
    !['duplicate-clone', 'duplicate-clone-size'].includes(finding.rule) ||
    !identity.startsWith(prefix)
  ) {
    return undefined;
  }
  const rest = identity.slice(prefix.length);
  const end = rest.search(PAIR_END);
  return end < 0 ? undefined : rest.slice(0, end);
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
    findings.push(
      {
        tool: analyzerName,
        rule: RULE_IDS.duplicateClone,
        path: sides[0].file,
        identity: `pair:${pair}:fragment:${fragment}:occurrence:${String(fragmentOccurrence)}`,
        message: duplicateMessage(sides, clone.lines),
        classification: 'enforceable',
        ...(positiveInteger(sides[0].line) === undefined
          ? {}
          : { location: { line: sides[0].line } }),
        ...sizeRatchet(pair, clone, sides),
      },
      ...cloneMetrics({ analyzerName, sides, clone, pair, occurrence }),
    );
  }
  return findings;
}
