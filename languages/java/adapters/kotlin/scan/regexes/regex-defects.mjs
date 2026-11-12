import {
  JVM_REGEX_RULES,
  jvmPatternFlags,
} from '../../../../../../shared/rules/regex/jvm-patterns.mjs';
import {
  REGEX_DIALECTS,
  patternDefects,
} from '../../../../../../core/tooling/regex-patterns/pattern-defects.mjs';
import { literalText, regexSites } from './regex-values.mjs';

const REGEX_DEFECT_MESSAGES = {
  [JVM_REGEX_RULES.part]:
    'A part of this regex never changes what it matches, does not do what it looks like, or has a shorter form with the same meaning: remove it, or rewrite it to match what was meant.',
  [JVM_REGEX_RULES.backtracking]:
    'This regex backtracks super-linearly on some inputs: rewrite it without nested or overlapping quantifiers, or use a string function. An exception fits only when the input is bounded and trusted.',
};

function siteDefects(scanned, site) {
  const pattern = literalText(scanned, site.part);
  const flags = jvmPatternFlags(
    site.options.map(({ start, end }) => scanned.code.slice(start, end)),
  );
  if (pattern === undefined || flags === undefined) {
    return [];
  }
  return (patternDefects(pattern, { flags, dialect: REGEX_DIALECTS.java }).defects ?? []).map(
    (defect) => ({
      rule: JVM_REGEX_RULES[defect.kind],
      offset: site.start,
      subject: `${defect.rule} ${pattern}`,
      message: defect.message,
    }),
  );
}

export function regexDefects(scanned) {
  return regexSites(scanned).flatMap((site) => siteDefects(scanned, site));
}

export const kotlinSourceRules = {
  messages: REGEX_DEFECT_MESSAGES,
  main: [regexDefects],
};
