// Structure limits and metrics, from neutral inputs.
//
// Input (`StructureReport`), produced by a language adapter from its own analyzer:
//   {
//     summary?: { [metric]: number },                    // whole-project figures
//     distributions?: { [kind]: { [percentile]: number } },
//     functions?: FunctionMetrics[],
//     classes?: TypeMetrics[],
//   }
//   FunctionMetrics = {
//     file: string,                  // project-relative path
//     name: string,                  // display name; the same file+name may repeat
//     start?: number, end?: number,  // 1-based lines of the function
//     lines?, statements?, maxControlNesting?, parameters?: number,
//     sourceHash?: string,           // digest of the function text; defaults to file:start:end
//     numberedAmongSameSource?: boolean, // the occurrence of a limit finding counts only the entries of the
//                                    // same name and source over that limit, so no other entry, under the
//                                    // limit or of other text, renames a finding (for names that repeat in a class)
//     ...any further numeric metric, reported as a descriptive metric
//   }
//   TypeMetrics = { file, name, start?, end?, ...numeric metrics }
//
// A function metric above its limit in FUNCTION_STRUCTURE_LIMITS is an enforceable finding keyed by
// name, occurrence and source hash; every other numeric metric is descriptive.

import {
  FUNCTION_STRUCTURE_LIMITS,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  renderMessage,
} from '../policy.mjs';
import {
  addMetric,
  hash,
  nextOccurrence,
  positiveInteger,
  summaryMetrics,
} from './finding-helpers.mjs';
import { exceptionRoute } from '../exceptions/rule-names.mjs';

const METADATA_FIELDS = new Set([
  'file',
  'name',
  'sourceHash',
  'numberedAmongSameSource',
  'start',
  'end',
]);

export function evaluateStructure(report, analyzerName, { hints = {} } = {}) {
  const findings = summaryMetrics(analyzerName, report.summary, 'structure');
  for (const [kind, values] of Object.entries(report.distributions ?? {})) {
    for (const [percentile, value] of Object.entries(values ?? {})) {
      addMetric(findings, {
        analyzerName,
        rule: 'distribution',
        path: '.',
        identity: `${kind}:${percentile}`,
        message: `${percentile} ${kind}`,
        metricName: `${kind}.${percentile}`,
        value,
      });
    }
  }
  addEntries(findings, analyzerName, report.functions, 'function', { hints });
  addEntries(findings, analyzerName, report.classes, 'class', { hints });
  return findings;
}

function addEntries(findings, analyzerName, entries = [], kind, messageOptions) {
  const occurrences = new Map();
  const violations = new Map();
  for (const entry of entries) {
    const occurrence = nextOccurrence(occurrences, `${entry.file}\0${entry.name}`);
    if (kind === 'function') {
      addLimitViolations(findings, analyzerName, entry, { occurrence, violations }, messageOptions);
    }
    for (const [metricName, value] of Object.entries(entry)) {
      if (METADATA_FIELDS.has(metricName)) {
        continue;
      }
      addMetric(findings, {
        analyzerName,
        rule: `${kind}-structure`,
        path: entry.file,
        identity: `${kind}:${entry.name}:occurrence:${String(occurrence)}:${metricName}`,
        message: `${metricName} for ${entry.name}`,
        metricName,
        value,
        symbol: entry.name,
        line: entry.start,
      });
    }
  }
}

function structureMessage(metricName) {
  if (metricName === 'maxControlNesting') {
    return MESSAGES.functionControlNesting;
  }
  return metricName === 'statements' ? MESSAGES.functionStatements : MESSAGES.functionStructure;
}

function withHint(message, hint) {
  if (hint === undefined) {
    return message;
  }
  return message.endsWith('.') ? `${message} ${hint}` : `${message}. ${hint}`;
}

function addLimitViolations(findings, analyzerName, entry, numbering, { hints }) {
  const sourceHash =
    entry.sourceHash ?? hash(`${entry.file}:${String(entry.start)}:${String(entry.end)}`);
  for (const [metricName, { limit, ruleId }] of Object.entries(FUNCTION_STRUCTURE_LIMITS)) {
    if (typeof entry[metricName] !== 'number' || entry[metricName] <= limit) {
      continue;
    }
    const route = exceptionRoute({
      rule: ruleId,
      path: entry.file,
      function: entry.name,
    });
    const occurrence =
      entry.numberedAmongSameSource === true
        ? nextOccurrence(
            numbering.violations,
            `${entry.file}\0${entry.name}\0${metricName}\0${sourceHash}`,
          )
        : numbering.occurrence;
    findings.push({
      tool: analyzerName,
      rule: ruleId,
      path: entry.file,
      identity: `function:${entry.name}:occurrence:${String(occurrence)}:source:${sourceHash}`,
      message: withHint(
        withHint(
          renderMessage(structureMessage(metricName), {
            name: entry.name,
            value: entry[metricName],
            metric: metricName,
            limit,
          }),
          hints[metricName],
        ),
        route,
      ),
      classification: 'enforceable',
      symbol: entry.name,
      ratchet: {
        key: `function:${entry.name}:occurrence:${String(occurrence)}:${metricName}`,
        value: entry[metricName],
        worseMessage: withHint(
          renderMessage(GREW_MESSAGES[metricName], {
            name: entry.name,
            value: entry[metricName],
            limit,
            base: '{base}',
          }),
          route,
        ),
        heldMessage: renderMessage(HELD_MESSAGES[metricName], {
          name: entry.name,
          value: entry[metricName],
          limit,
          base: '{base}',
        }),
      },
      ...(positiveInteger(entry.start) === undefined ? {} : { location: { line: entry.start } }),
    });
  }
}
