import {
  REGEX_DIALECTS,
  patternDefects,
} from '../../../../../core/tooling/regex-patterns/pattern-defects.mjs';
import { callUntyped } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

export type RegexEntry = {
  readonly rule: string;
  readonly path: string;
  readonly line?: number | undefined;
  readonly subject: string;
  readonly data?: unknown;
};

export type RegexDefect = {
  readonly kind: string;
  readonly rule: string;
  readonly description: string;
  readonly hint: string;
};

export type RegexSite = { readonly pattern: string; readonly flags: string };

export function siteOf(data: unknown): RegexSite {
  return { pattern: textOf(fieldOf(data, 'pattern')), flags: textOf(fieldOf(data, 'flags')) };
}

export function regexDefects(
  site: RegexSite,
  dialectName: 'python' | 'pythonAscii',
): RegexDefect[] {
  const dialect = REGEX_DIALECTS[dialectName];
  const found = callUntyped(patternDefects, site.pattern, {
    flags: site.flags.replace('a', ''),
    dialect,
  });
  return listOf(fieldOf(found, 'defects')).map((defect) => ({
    kind: textOf(fieldOf(defect, 'kind')),
    rule: textOf(fieldOf(defect, 'rule')),
    description: textOf(fieldOf(defect, 'description')),
    hint: textOf(fieldOf(defect, 'hint')),
  }));
}
