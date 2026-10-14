import { DEFAULT_CRAP_SCORE_LIMIT } from '../../../shared/policy.mjs';
import { crapFindings } from '../../../shared/rules/crap.mjs';
import { childrenNamed, createIdentityCounter, normalizeReportPath, parseXml } from './common.mjs';

export function calculateCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

export function ingestCrap(lizardCsv, jacocoXml, options = {}) {
  return ingestCrapFunctions(parseLizardCsv(lizardCsv), jacocoXml, options);
}

export function ingestCrapFunctions(parsed, jacocoXml, options = {}) {
  const coverageOf = coverageLookup({
    methods: jacocoMethods(jacocoXml),
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
    findings: crapFindings(functions, {
      tool,
      limit,
      unknownMessage: options.unknownMessage,
    }),
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

function jacocoMethods(xml) {
  const report = parseXml(xml);
  if (report.name !== 'report') {
    throw new TypeError('JaCoCo report root element must be <report>');
  }
  const byFile = new Map();
  for (const pkg of childrenNamed(report, 'package')) {
    for (const cls of childrenNamed(pkg, 'class')) {
      const file = [pkg.attrs.name, cls.attrs.sourcefilename].filter(Boolean).join('/');
      const simpleName = (cls.attrs.name ?? '').split('/').at(-1).split('$').at(-1);
      for (const method of childrenNamed(cls, 'method')) {
        const line = Number.parseInt(method.attrs.line, 10);
        if (!Number.isInteger(line)) {
          continue;
        }
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
  }
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
  const methodName = fn.name.split('::').at(-1);
  return candidates.filter(
    (method) => method.name === methodName && method.line >= fn.start && method.line <= fn.end,
  );
}

function rootRelativeKeys(sourceRoots) {
  return (filePath) =>
    sourceRoots.flatMap((root) => {
      const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
      return filePath.startsWith(prefix) ? [filePath.slice(prefix.length)] : [];
    });
}

function coverageLookup({ methods, keysOf, selectMethods, parsed }) {
  const siblings = Map.groupBy(parsed, (fn) => fn.file);

  function coverageOf(fn, filePath) {
    const matches = keysOf(filePath).flatMap((key) =>
      selectMethods(fn, methods.get(key) ?? [], siblings.get(fn.file)),
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
