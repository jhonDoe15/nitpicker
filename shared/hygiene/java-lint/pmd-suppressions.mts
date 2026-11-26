import { attributesOf, xmlFilesMatching } from './xml-files.mts';
import type { EverywhereSuppression } from './checkstyle-suppressions.mts';

const RULESET = /<ruleset[\s>]/u;
const EXCLUDE_ALL = /<exclude-pattern>\s*(?:\^?\.[*+]\$?|\(\?s\)\.[*+])\s*<\/exclude-pattern>/u;
const INCLUDE = /<include-pattern>/u;
const SUPPRESS_ALL =
  /name="violationSuppressRegex"[^>]*?(?:value="(?:\^?\(\?s\))?\^?\.[*+]\$?"|>\s*<value>\s*\^?\.[*+]\$?\s*<\/value>)/u;
const RULE_ELEMENT = /<rule\b([^>]*?)(\/>|>[\s\S]*?<\/rule>)/gu;

function ruleName(attributes: ReadonlyMap<string, string>): string | undefined {
  const reference = attributes.get('ref');
  return reference === undefined
    ? attributes.get('name')
    : (reference.split('/').at(-1)?.split('.xml').join('') ?? reference);
}

export function pmdEverywhereSuppressions(
  projectRoot: string,
  files: readonly string[],
): EverywhereSuppression[] {
  return xmlFilesMatching(projectRoot, files, RULESET).flatMap(({ file, text }) => {
    const rules = [...text.matchAll(RULE_ELEMENT)].map((match) => ({
      name: ruleName(attributesOf(match[1] ?? '')),
      text: match[0],
    }));
    const outside = text.replaceAll(RULE_ELEMENT, ' ');
    const named = rules.flatMap(({ name }) => name ?? []);
    const everyRule = EXCLUDE_ALL.test(outside) && !INCLUDE.test(text) ? named : [];
    const own = rules.flatMap(({ name, text: ruleText }) =>
      name !== undefined && (SUPPRESS_ALL.test(ruleText) || EXCLUDE_ALL.test(ruleText))
        ? [name]
        : [],
    );
    const modules = [...new Set([...everyRule, ...own])];
    return modules.length === 0 ? [] : [{ file, config: file, modules }];
  });
}
