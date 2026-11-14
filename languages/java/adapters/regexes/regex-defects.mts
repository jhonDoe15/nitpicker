import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { withMessage } from '../../../../shared/messages/advice/finding-advice.mjs';
import { ROUTE_SENTENCE, appendSentence } from '../../../../shared/messages/exception-sentence.mjs';
import { hash, nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import { JVM_REGEX_RULES, jvmPatternFlags } from '../../../../shared/rules/regex/jvm-patterns.mjs';
import {
  REGEX_DIALECTS,
  patternDefects,
} from '../../../../core/tooling/regex-patterns/pattern-defects.mjs';
import { withProjectEnumPredicates } from '../review-rules/enum-predicates.mjs';
import { offsetOf } from '../review-rules/java-sources.mjs';
import { type JavaFinding, callUntyped, findingsOf } from '../typed/java-values.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';

type Literal = { readonly value: string; readonly end: number };
type PatternSite = { readonly pattern: string; readonly flags: string };

const routeSentence: RegExp = ROUTE_SENTENCE;
const KINDS = new Map(Object.entries(JVM_REGEX_RULES).map(([kind, rule]) => [rule, kind]));
const ESCAPES: Readonly<Record<string, string>> = {
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

function escapeValue([, unicode, octal, simple]: readonly unknown[]): string | undefined {
  if (typeof unicode === 'string') {
    return String.fromCodePoint(Number.parseInt(unicode, HEX_RADIX));
  }
  if (typeof octal === 'string') {
    return String.fromCodePoint(Number.parseInt(octal, OCTAL_RADIX));
  }
  return typeof simple === 'string' ? ESCAPES[simple] : undefined;
}

export function javaStringLiteral(text: string, start: number): Literal | undefined {
  const literal = STRING_LITERAL.exec(text.slice(start));
  if (literal === null || text.startsWith('"""', start)) {
    return undefined;
  }
  const body = literal[1] ?? '';
  if ([...body.matchAll(ESCAPE)].some((escape) => escapeValue(escape) === undefined)) {
    return undefined;
  }
  return {
    value: body.replaceAll(ESCAPE, (...escape: unknown[]) => escapeValue(escape) ?? ''),
    end: start + literal[0].length,
  };
}

function argumentRest(text: string, from: number): string {
  let depth = 0;
  for (const { 0: paren, index } of text.slice(from).matchAll(PARENS)) {
    depth += paren === '(' ? 1 : -1;
    if (depth < 0) {
      return text.slice(from, from + index);
    }
  }
  return '';
}

function flagsAfter(
  text: string,
  { start, end }: { readonly start: number; readonly end: number },
): string | undefined {
  const rest = argumentRest(text, end).trim();
  if (!rest.startsWith(',')) {
    return '';
  }
  return COMPILE_BEFORE.test(text.slice(0, start)) ? jvmPatternFlags([rest.slice(1)]) : '';
}

function patternAt(projectRoot: string, finding: JavaFinding): PatternSite | undefined {
  const file = pathInside(projectRoot, finding.path);
  const line = finding.location?.line;
  if (line === undefined || file === undefined || !existsSync(file)) {
    return undefined;
  }
  const text = readFileSync(file, 'utf8');
  const offset = offsetOf(text, { line, column: finding.location?.column ?? 1 });
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

function defectFindings(
  finding: JavaFinding,
  {
    projectRoot,
    occurrences,
  }: { readonly projectRoot: string; readonly occurrences: Map<string, number> },
): JavaFinding[] {
  const site = patternAt(projectRoot, finding);
  if (site === undefined) {
    return [];
  }
  const defects = listOf(
    fieldOf(
      callUntyped(patternDefects, site.pattern, {
        flags: site.flags,
        dialect: REGEX_DIALECTS.java,
      }),
      'defects',
    ),
  );
  return defects
    .filter((defect) => fieldOf(defect, 'kind') === KINDS.get(finding.rule))
    .flatMap((defect) => {
      const key = `${textOf(fieldOf(defect, 'rule'))}\0${site.pattern}`;
      const occurrence: unknown = nextOccurrence(occurrences, `${finding.path}\0${key}`);
      const suffix = occurrence === 1 ? '' : `#${String(occurrence)}`;
      const route = routeSentence.exec(textOf(finding.message))?.[0];
      const message: unknown = appendSentence(textOf(fieldOf(defect, 'message')), route);
      return findingsOf([
        callUntyped(
          withMessage,
          { ...finding, identity: `${finding.rule}:${hash(key)}${suffix}` },
          { message },
        ),
      ]);
    });
}

export function withRegexDefects(
  findings: readonly JavaFinding[],
  projectRoot: string,
): JavaFinding[] {
  const occurrences = new Map<string, number>();
  return findings.flatMap((finding) =>
    finding.tool === 'pmd' && KINDS.has(finding.rule) && finding.path.endsWith('.java')
      ? defectFindings(finding, { projectRoot, occurrences })
      : [finding],
  );
}

export function withProjectSourceRules(
  findings: readonly JavaFinding[],
  projectRoot: string,
): JavaFinding[] {
  return withRegexDefects(
    findingsOf(withProjectEnumPredicates(findings, projectRoot)),
    projectRoot,
  );
}
