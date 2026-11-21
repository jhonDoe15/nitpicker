import { DEFAULT_CRAP_SCORE_LIMIT } from '../policy.mts';
import { crapFindings } from '../rules/crap.mts';
import {
  type OccurrenceCounter,
  declarationLine,
  hash,
  nameFreeHash,
  occurrenceCounter,
} from '../rules/finding-parts.mts';
import { createIdentityCounter, normalizeReportPath } from './report-records.mts';
import { cachedValue } from '../values/caching/cached-value.mts';
import type {
  CrapResolution,
  CrapRow,
  CrapRowOptions,
  CrapState,
  CsvCharacters,
  CsvState,
  CsvToken,
  SameSourceKey,
} from './typed/lizard-types.mts';

const FULL_COVERAGE = 100;
const CRAP_EXPONENT = 3;
const LIZARD_FIELD_COUNT = 11;

export function calculateCrap(complexity: number, coveragePercent: number): number {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** CRAP_EXPONENT + complexity;
}

export function ingestCrapRows<Row extends CrapRow>(
  parsed: readonly Row[],
  options: CrapRowOptions,
  resolve: (fn: Row, filePath: string) => CrapResolution,
): { readonly findings: ReturnType<typeof crapFindings> } {
  const tool = options.tool ?? 'crap';
  const limit = options.limit ?? DEFAULT_CRAP_SCORE_LIMIT;
  const state: CrapState<Row> = {
    options,
    limit,
    resolve,
    counters: new Map(),
    sameSourceByFile: new Map(),
  };
  const functions = parsed.flatMap((fn) => {
    const filePath = normalizeReportPath(fn.file, options.root);
    return filePath === undefined ? [] : [crapRow(fn, filePath, state)];
  });
  return {
    findings: crapFindings(functions, {
      tool,
      limit,
      ...(options.unknownMessage === undefined ? {} : { unknownMessage: options.unknownMessage }),
    }),
  };
}

function crapRow<Row extends CrapRow>(
  fn: Row,
  filePath: string,
  { options, limit, resolve, counters, sameSourceByFile }: CrapState<Row>,
) {
  const { coverage, name = fn.longName ?? '' } = resolve(fn, filePath);
  const crap = coverage === undefined ? undefined : calculateCrap(fn.ccn, coverage);
  const text = options.sourceText?.({ file: filePath, start: fn.start, end: fn.end });
  const sourceHash = coverage === undefined || text === undefined ? undefined : hash(text);
  const key =
    fn.numberedAmongSameSource === true
      ? keyAmongSameSource(cachedValue(sameSourceByFile, filePath, occurrenceCounter), {
          name,
          sourceHash,
          over: crap === undefined || crap >= limit,
        })
      : cachedValue(counters, filePath, createIdentityCounter)(`function:${name}`);
  return {
    path: filePath,
    name,
    identity: sourceHash === undefined ? key : `${key}:source:${sourceHash}`,
    ratchetKey: `${key}:crap`,
    ...(text === undefined || text === ''
      ? {}
      : {
          anchor: `function:crap:text:${nameFreeHash(text, name)}`,
          declarationKey: `function:${name}:declaration:${hash(fn.signature ?? declarationLine(text))}:crap`,
        }),
    line: fn.start,
    endLine: fn.end,
    crap,
    covered: coverage !== undefined && coverage >= FULL_COVERAGE,
  };
}

function keyAmongSameSource(
  nextOccurrence: OccurrenceCounter,
  { name, sourceHash, over }: SameSourceKey,
): string {
  const base = `function:${name}`;
  if (!over) {
    return base;
  }
  const occurrence = nextOccurrence(`${base}\0${String(sourceHash)}`);
  return occurrence === 1 ? base : `${base}#${String(occurrence)}`;
}

export function parseLizardCsv(text: string): CrapRow[] {
  const functions: CrapRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') {
      continue;
    }
    const fields = splitCsvLine(line);
    const ccn = Number.parseInt(fields[1] ?? '', 10);
    const start = Number.parseInt(fields[9] ?? '', 10);
    const end = Number.parseInt(fields[10] ?? '', 10);
    if (fields.length < LIZARD_FIELD_COUNT || ![ccn, start, end].every(Number.isInteger)) {
      throw new TypeError(`Unrecognized lizard CSV row: ${line}`);
    }
    functions.push({
      ccn,
      file: fields[6] ?? '',
      name: fields[7],
      longName: fields[8] ?? '',
      start,
      end,
    });
  }
  return functions;
}

function consumeQuotedCharacter(
  state: CsvState,
  { char, next }: CsvToken,
  characters: CsvCharacters,
): void {
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

function consumeCsvCharacter(state: CsvState, token: CsvToken, characters: CsvCharacters): void {
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

function splitCsvLine(line: string): string[] {
  const state: CsvState = { fields: [], current: '', quoted: false };
  const characters = line.split('').entries();
  for (const [index, char] of characters) {
    consumeCsvCharacter(state, { char, next: line[index + 1] }, characters);
  }
  return [...state.fields, state.current];
}
