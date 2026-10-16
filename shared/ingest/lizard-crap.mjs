import { DEFAULT_CRAP_SCORE_LIMIT } from '../policy.mjs';
import { crapFindings } from '../rules/crap.mjs';
import { nextOccurrence } from '../rules/finding-helpers.mjs';
import { createIdentityCounter, normalizeReportPath } from './common.mjs';

const FULL_COVERAGE = 100;

export function calculateCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

export function ingestCrapRows(parsed, options, resolve) {
  const tool = options.tool ?? 'crap';
  const limit = options.limit ?? DEFAULT_CRAP_SCORE_LIMIT;
  const state = { options, limit, resolve, counters: new Map(), sameSourceByFile: new Map() };
  const functions = parsed.flatMap((fn) => {
    const filePath = normalizeReportPath(fn.file, options.root);
    return filePath === undefined ? [] : [crapRow(fn, filePath, state)];
  });
  return {
    findings: crapFindings(functions, { tool, limit, unknownMessage: options.unknownMessage }),
  };
}

function crapRow(fn, filePath, { options, limit, resolve, counters, sameSourceByFile }) {
  const { coverage, name = fn.longName } = resolve(fn, filePath);
  const crap = coverage === undefined ? undefined : calculateCrap(fn.ccn, coverage);
  const sourceHash =
    coverage === undefined
      ? undefined
      : options.sourceHash?.({ file: filePath, start: fn.start, end: fn.end });
  const key =
    fn.numberedAmongSameSource === true
      ? keyAmongSameSource(
          perFile(sameSourceByFile, filePath, () => new Map()),
          {
            name,
            sourceHash,
            over: crap === undefined || crap >= limit,
          },
        )
      : perFile(counters, filePath, createIdentityCounter)(`function:${name}`);
  return {
    path: filePath,
    name,
    identity: sourceHash === undefined ? key : `${key}:source:${sourceHash}`,
    ratchetKey: `${key}:crap`,
    line: fn.start,
    crap,
    covered: coverage !== undefined && coverage >= FULL_COVERAGE,
  };
}

function perFile(byFile, filePath, create) {
  if (!byFile.has(filePath)) {
    byFile.set(filePath, create());
  }
  return byFile.get(filePath);
}

function keyAmongSameSource(seen, { name, sourceHash, over }) {
  const base = `function:${name}`;
  if (!over) {
    return base;
  }
  const occurrence = nextOccurrence(seen, `${base}\0${String(sourceHash)}`);
  return occurrence === 1 ? base : `${base}#${String(occurrence)}`;
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

function consumeQuotedCharacter(state, { char, next }, characters) {
  if (char === '"' && next === '"') {
    state.current += '"';
    characters.next();
    return;
  }
  if (char === '"') {
    state.quoted = false;
    return;
  }
  state.current += char;
}

function consumeCsvCharacter(state, token, characters) {
  if (state.quoted) {
    consumeQuotedCharacter(state, token, characters);
    return;
  }
  if (token.char === '"') {
    state.quoted = true;
    return;
  }
  if (token.char === ',') {
    state.fields.push(state.current);
    state.current = '';
    return;
  }
  state.current += token.char;
}

function splitCsvLine(line) {
  const state = { fields: [], current: '', quoted: false };
  const characters = line.split('').entries();
  for (const [index, char] of characters)
    consumeCsvCharacter(state, { char, next: line[index + 1] }, characters);
  return [...state.fields, state.current];
}
