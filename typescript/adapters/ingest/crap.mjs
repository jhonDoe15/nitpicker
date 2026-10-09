import {
  DEFAULT_CRAP_SCORE_LIMIT,
  MESSAGES,
  RULE_IDS,
  renderMessage,
} from '../../shared/policy.mjs';
import { childrenNamed, createIdentityCounter, normalizeReportPath, parseXml } from './common.mjs';

// lizard CSV (cyclomatic complexity per function) joined with JaCoCo XML (per-method coverage) ->
// CRAP findings, with the same rules as the TypeScript `crap` check:
//   crap = ccn^2 * (1 - coverage)^3 + ccn, where coverage is the lower of the method's line
//   coverage ("statement") and branch coverage, whichever are measured;
//   `crap-score-limit` (enforceable) when crap >= limit; `crap-coverage-unknown` (enforceable)
//   when no JaCoCo method matches the function or it has no counters.
// Identity is the function's long name (class, method and parameter text from lizard) plus a
// `#n` suffix for repeats; the line is never part of it. A JaCoCo method belongs to a lizard
// function when the file is the same, the method name is the same (`<init>` is the class name) and
// the JaCoCo method's first line lies inside the function's line range.
// `options.sourceRoots` (e.g. ["src/main/java"]) maps lizard's project-relative paths back to
// JaCoCo's package-relative ones; `options.limit` overrides the score limit.

export function calculateCrap(complexity, coveragePercent) {
  const uncovered = 1 - coveragePercent / 100;
  return complexity * complexity * uncovered ** 3 + complexity;
}

export function ingestCrap(lizardCsv, jacocoXml, options = {}) {
  const tool = options.tool ?? 'crap';
  const limit = options.limit ?? DEFAULT_CRAP_SCORE_LIMIT;
  const sourceRoots = options.sourceRoots ?? [''];
  const methods = jacocoMethods(jacocoXml);
  const unique = createIdentityCounter();
  const findings = [];

  for (const fn of parseLizardCsv(lizardCsv)) {
    const filePath = normalizeReportPath(fn.file, options.root);
    if (filePath === undefined) {
      continue;
    }
    const coverage = coverageFor(fn, filePath, methods, sourceRoots);
    const where = {
      tool,
      path: filePath,
      identity: unique(`function:${fn.longName}`),
      symbol: fn.longName,
      location: { line: fn.start },
    };
    if (coverage === undefined) {
      findings.push({
        ...where,
        rule: RULE_IDS.crapCoverageUnknown,
        message: renderMessage(MESSAGES.crapCoverageUnknown, { name: fn.longName }),
        classification: 'enforceable',
      });
      continue;
    }
    const crap = calculateCrap(fn.ccn, coverage);
    if (crap >= limit) {
      findings.push({
        ...where,
        rule: RULE_IDS.crapScoreLimit,
        message: renderMessage(MESSAGES.crapScoreLimit, {
          name: fn.longName,
          crap: crap.toFixed(2),
          limit,
        }),
        classification: 'enforceable',
      });
    }
  }
  return { findings };
}

// lizard --csv rows: nloc, ccn, tokens, params, length, "name@start-end@file", file, name,
// long name, start, end. No header row.
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

// package-relative file path -> [{ name, first line, LINE and BRANCH counters }]
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

// Effective coverage percent of a lizard function, or undefined when it cannot be determined.
function coverageFor(fn, filePath, methods, sourceRoots) {
  const methodName = fn.name.split('::').at(-1);
  const matches = sourceRoots.flatMap((root) => {
    const prefix = root === '' ? '' : `${root.replace(/\/+$/, '')}/`;
    if (!filePath.startsWith(prefix)) {
      return [];
    }
    return (methods.get(filePath.slice(prefix.length)) ?? []).filter(
      (method) => method.name === methodName && method.line >= fn.start && method.line <= fn.end,
    );
  });
  const sum = (key) => ({
    covered: matches.reduce((total, method) => total + method[key].covered, 0),
    total: matches.reduce((total, method) => total + method[key].total, 0),
  });
  const percents = [sum('lines'), sum('branches')]
    .filter((measure) => measure.total > 0)
    .map((measure) => (measure.covered / measure.total) * 100);
  return percents.length === 0 ? undefined : Math.min(...percents);
}
