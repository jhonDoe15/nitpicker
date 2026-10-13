import { DEFAULT_CRAP_SCORE_LIMIT } from '../policy.mjs';
import { crapFindings } from '../rules/crap.mjs';
import { createIdentityCounter, normalizeReportPath } from './common.mjs';

export function calculateCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

export function ingestCrapRows(parsed, options, resolve) {
  const tool = options.tool ?? 'crap';
  const limit = options.limit ?? DEFAULT_CRAP_SCORE_LIMIT;
  const unique = createIdentityCounter();
  const functions = [];

  for (const fn of parsed) {
    const filePath = normalizeReportPath(fn.file, options.root);
    if (filePath === undefined) {
      continue;
    }
    const { coverage, name = fn.longName } = resolve(fn, filePath);
    const key = unique(`function:${name}`);
    const sourceHash =
      coverage === undefined
        ? undefined
        : options.sourceHash?.({ file: filePath, start: fn.start, end: fn.end });
    functions.push({
      path: filePath,
      name,
      identity: sourceHash === undefined ? key : `${key}:source:${sourceHash}`,
      ratchetKey: `${key}:crap`,
      line: fn.start,
      crap: coverage === undefined ? undefined : calculateCrap(fn.ccn, coverage),
    });
  }
  return {
    findings: crapFindings(functions, { tool, limit, unknownMessage: options.unknownMessage }),
  };
}

export function parseLizardCsv(text) {
  const functions = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') {
      continue;
    }
    const fields = splitCsvLine(line);
    const ccn = Number.parseInt(fields[1], 10);
    const start = Number.parseInt(fields[9], 10);
    const end = Number.parseInt(fields[10], 10);
    if (fields.length < 11 || ![ccn, start, end].every(Number.isInteger)) {
      throw new TypeError(`Unrecognized lizard CSV row: ${line}`);
    }
    functions.push({ ccn, file: fields[6], name: fields[7], longName: fields[8], start, end });
  }
  return functions;
}

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}
