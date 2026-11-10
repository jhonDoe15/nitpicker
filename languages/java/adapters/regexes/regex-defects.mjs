import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import { JVM_REGEX_RULES, jvmPatternFlags } from '../../../../shared/rules/regex/jvm-patterns.mjs';
import {
  REGEX_DIALECTS,
  patternDefects,
} from '../../../../core/tooling/regex-patterns/pattern-defects.mjs';
import { withProjectEnumPredicates } from '../review-rules/enum-predicates.mjs';
import { offsetOf } from '../review-rules/java-sources.mjs';

const KINDS = new Map(Object.entries(JVM_REGEX_RULES).map(([kind, rule]) => [rule, kind]));
const ESCAPES = {
  b: '\b',
  t: '\t',
  n: '\n',
  f: '\f',
  r: '\r',
  s: ' ',
  '"': '"',
  "'": "'",
  '\\': '\\',
};
const STRING_LITERAL = /^"((?:[^\n"\\]|\\.)*)"/u;
const ESCAPE = /\\(?:u+([\dA-Fa-f]{4})|([0-3]?[0-7]{1,2})|(.))/gu;
const PARENS = /[()]/gu;
const COMPILE_BEFORE = /\bcompile\s*\(\s*$/u;
const HEX_RADIX = 16;
const OCTAL_RADIX = 8;

function escapeValue([, unicode, octal, simple]) {
  if (unicode !== undefined) {
    return String.fromCodePoint(Number.parseInt(unicode, HEX_RADIX));
  }
  if (octal !== undefined) {
    return String.fromCodePoint(Number.parseInt(octal, OCTAL_RADIX));
  }
  return ESCAPES[simple];
}

export function javaStringLiteral(text, start) {
  const literal = STRING_LITERAL.exec(text.slice(start));
  if (literal === null || text.startsWith('"""', start)) {
    return undefined;
  }
  const body = literal[1];
  if ([...body.matchAll(ESCAPE)].some((escape) => escapeValue(escape) === undefined)) {
    return undefined;
  }
  return {
    value: body.replaceAll(ESCAPE, (...escape) => escapeValue(escape)),
    end: start + literal[0].length,
  };
}

function argumentRest(text, from) {
  let depth = 0;
  for (const { 0: paren, index } of text.slice(from).matchAll(PARENS)) {
    depth += paren === '(' ? 1 : -1;
    if (depth < 0) {
      return text.slice(from, from + index);
    }
  }
  return '';
}

function flagsAfter(text, { start, end }) {
  const rest = argumentRest(text, end).trim();
  if (!rest.startsWith(',')) {
    return '';
  }
  return COMPILE_BEFORE.test(text.slice(0, start)) ? jvmPatternFlags([rest.slice(1)]) : '';
}

function patternAt(projectRoot, finding) {
  const file = pathInside(projectRoot, finding.path);
  if (finding.location === undefined || file === undefined || !existsSync(file)) {
    return undefined;
  }
  const text = readFileSync(file, 'utf8');
  const offset = offsetOf(text, finding.location);
  const lineEnd = text.indexOf('\n', offset);
  const quote = text.slice(offset, lineEnd === -1 ? undefined : lineEnd).indexOf('"');
  const start = offset + quote;
  const literal = quote === -1 ? undefined : javaStringLiteral(text, start);
  if (literal === undefined) {
    return undefined;
  }
  const flags = flagsAfter(text, { start, end: literal.end });
  return flags === undefined ? undefined : { pattern: literal.value, flags };
}

function defectFindings(finding, { projectRoot, occurrences }) {
  const site = patternAt(projectRoot, finding);
  if (site === undefined) {
    return [];
  }
  const { defects = [] } = patternDefects(site.pattern, {
    flags: site.flags,
    dialect: REGEX_DIALECTS.java,
  });
  return defects
    .filter((defect) => defect.kind === KINDS.get(finding.rule))
    .map((defect) => {
      const key = `${defect.rule}\0${site.pattern}`;
      const occurrence = nextOccurrence(occurrences, `${finding.path}\0${key}`);
      const suffix = occurrence === 1 ? '' : `#${String(occurrence)}`;
      return {
        ...finding,
        identity: `${finding.rule}:${hash(key)}${suffix}`,
        message: defect.message,
      };
    });
}

export function withRegexDefects(findings, projectRoot) {
  const occurrences = new Map();
  return findings.flatMap((finding) =>
    finding.tool === 'pmd' && KINDS.has(finding.rule) && finding.path.endsWith('.java')
      ? defectFindings(finding, { projectRoot, occurrences })
      : [finding],
  );
}

export function withProjectSourceRules(findings, projectRoot) {
  return withRegexDefects(withProjectEnumPredicates(findings, projectRoot), projectRoot);
}
