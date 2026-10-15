import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../shared/policy.mjs';
import { crapFindings } from '../../../shared/rules/crap.mjs';
import { nextOccurrence } from '../../../shared/rules/finding-helpers.mjs';
import { childrenNamed, createIdentityCounter, normalizeReportPath, parseXml } from './common.mjs';
import { jacocoLineUnits } from './coverage/jacoco-lines.mjs';

export function calculateCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

export function ingestCrap(structure, jacocoXml, options = {}) {
  return ingestCrapFunctions(structureFunctions(structure), jacocoXml, options);
}

export function ingestCrapFunctions(parsed, jacocoXml, options = {}) {
  const report = parseJacocoReport(jacocoXml);
  const coverageOf = coverageLookup({
    pools: {
      methods: jacocoMethods(report),
      lines: parsed.some((fn) => fn.lineScoped) ? jacocoLineUnits(report) : new Map(),
    },
    keysOf: options.jacocoKeys ?? rootRelativeKeys(options.sourceRoots ?? ['']),
    selectMethods: options.selectMethods ?? selectNamedMethods,
    parsed,
  });
  return ingestCrapRows(parsed, options, (fn, filePath) => ({
    coverage: coverageOf(fn, filePath),
  }));
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

function structureFunctions(entries) {
  return entries
    .filter((entry) => entry.privateEmptyConstructor !== true)
    .map((entry) => {
      if (!Number.isInteger(entry.complexity)) {
        throw new TypeError(`Structure entry without complexity: ${entry.name}`);
      }
      if (typeof entry.signature !== 'string') {
        throw new TypeError(`Structure entry without signature: ${entry.name}`);
      }
      return {
        ccn: entry.complexity,
        file: entry.file,
        name: entry.name.split('.').at(-1),
        longName: entry.signature,
        start: entry.start,
        end: entry.end,
      };
    });
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

function parseJacocoReport(xml) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  return report;
}

function jacocoMethods(report) {
  const byFile = new Map();
  const classes = childrenNamed(report, 'package').flatMap((pkg) =>
    childrenNamed(pkg, 'class').map((cls) => ({ pkg, cls })),
  );
  for (const entry of classes) addClassMethods(entry, byFile);
  return byFile;
}

function counter(element, type) {
  const found = childrenNamed(element, 'counter').find(
    (candidate) => candidate.attrs.type === type,
  );
  if (found === undefined) {
    return { covered: 0, total: 0 };
  }
  const covered = Number.parseInt(found.attrs.covered, 10);
  return { covered, total: covered + Number.parseInt(found.attrs.missed, 10) };
}

function selectNamedMethods(fn, candidates) {
  return candidates.filter(
    (method) => method.name === fn.name && method.line >= fn.start && method.line <= fn.end,
  );
}

function rootRelativeKeys(sourceRoots) {
  return (filePath) =>
    sourceRoots.flatMap((root) => {
      const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
      return filePath.startsWith(prefix) ? [filePath.slice(prefix.length)] : [];
    });
}

function coverageLookup({ pools, keysOf, selectMethods, parsed }) {
  const siblings = Map.groupBy(parsed, (fn) => fn.file);

  function coverageOf(fn, filePath) {
    const pool = fn.lineScoped ? pools.lines : pools.methods;
    const matches = keysOf(filePath).flatMap((key) =>
      selectMethods(fn, pool.get(key) ?? [], siblings.get(fn.file)),
    );
    return lowestCoverage(matches);
  }

  return coverageOf;
}

function lowestCoverage(matches) {
  function sum(key) {
    return {
      covered: matches.reduce((total, method) => total + method[key].covered, 0),
      total: matches.reduce((total, method) => total + method[key].total, 0),
    };
  }
  const percents = [sum('lines'), sum('branches')]
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : Math.min(...percents);
}

function addClassMethods({ pkg, cls }, byFile) {
  const file = [pkg.attrs.name, cls.attrs.sourcefilename].filter(Boolean).join('/');
  const simpleName = (cls.attrs.name ?? '')
    .split('/')
    .at(-1)
    .split('$')
    .at(-1)
    .replace(/^\d+/u, '');
  const methods = childrenNamed(cls, 'method')
    .map((method) => ({ method, line: Number.parseInt(method.attrs.line, 10) }))
    .filter(({ line }) => Number.isInteger(line));
  for (const { method, line } of methods) {
    byFile.set(file, [
      ...(byFile.get(file) ?? []),
      {
        name: method.attrs.name === '<init>' ? simpleName : method.attrs.name,
        className: cls.attrs.name ?? '',
        line,
        lines: counter(method, 'LINE'),
        branches: counter(method, 'BRANCH'),
      },
    ]);
  }
}
