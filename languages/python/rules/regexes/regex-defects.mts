import { RULES_TOOL } from '../hints/tool.mts';
import { regexDefects, siteOf, type RegexEntry } from './typed/regex-views.mts';
import type { RuleHint } from '../hints/hint-types.mts';

const SITE_RULE = 'regex-pattern';
const REGEX_PART_RULE = 'regex-part-defect';
const REGEX_BACKTRACKING_RULE = 'regex-backtracking';
const RULES: Readonly<Record<string, string>> = {
  part: REGEX_PART_RULE,
  backtracking: REGEX_BACKTRACKING_RULE,
};

function defectEntries(entry: RegexEntry): RegexEntry[] {
  const site = siteOf(entry.data);
  const { pattern, flags } = site;
  return regexDefects(site, flags.includes('a') ? 'pythonAscii' : 'python').map((defect) => ({
    rule: RULES[defect.kind] ?? '',
    path: entry.path,
    subject: `${defect.rule} ${pattern}`,
    line: entry.line,
    data: { description: defect.description, hint: defect.hint },
  }));
}

export function withRegexDefects<Entry extends RegexEntry>(
  entries: readonly Entry[],
): (Entry | RegexEntry)[] {
  return entries.flatMap((entry) => (entry.rule === SITE_RULE ? defectEntries(entry) : [entry]));
}

const REFERENCE_DATA = {
  [REGEX_PART_RULE]: {
    description:
      'A part of this `re` pattern never changes what it matches, does not do what it looks like, or has a shorter form with the same meaning',
    hint: 'Remove the part, rewrite the pattern to match what was meant, or write the shorter form.',
  },
  [REGEX_BACKTRACKING_RULE]: {
    description:
      'This `re` pattern has nested or overlapping quantifiers that backtrack super-linearly on some inputs',
    hint: 'Rewrite the pattern without nested or overlapping quantifiers, or use a string method. An exception fits only when the input is bounded and trusted.',
  },
};

export const REGEX_DEFECT_HINTS: readonly RuleHint[] = Object.entries(REFERENCE_DATA).map(
  ([rule, referenceData]) => ({
    tool: RULES_TOOL,
    rules: [rule],
    describe: (_subject, _libraries, data) => String(data['description']),
    referenceData,
    allowedFor: (data) => String(data['hint']),
  }),
);
