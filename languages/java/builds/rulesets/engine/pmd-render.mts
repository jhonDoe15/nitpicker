import type { XmlElement } from '../../../../../shared/ingest/report-records.mts';
import { element, renderXml } from '../../../../../shared/xml/xml-write.mts';
import type { ResolvedRule } from './pmd-catalog.mts';
import {
  overriddenMessage,
  overriddenPriority,
  overriddenProperties,
  portablePattern,
} from './pmd-rule-parts.mts';

export type RulesetScope = {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};

function matchesWhole(pattern: string, file: string): boolean {
  const portable = new RegExp(portablePattern(pattern));
  return new RegExp(`^(?:${portable.source})$`).test(file);
}

export function covers({ include, exclude }: RulesetScope, file: string): boolean {
  return (
    !exclude.some((pattern) => matchesWhole(pattern, file)) ||
    include.some((pattern) => matchesWhole(pattern, file))
  );
}

const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NAMESPACE = 'http://pmd.sourceforge.net/ruleset/2.0.0';
const EVERY_FILE = '.*';

function textElement(name: string, text: string): XmlElement {
  return { name, attrs: {}, children: [], text };
}

function ruleReference(rule: ResolvedRule): XmlElement {
  const message = overriddenMessage(rule);
  const priority = overriddenPriority(rule);
  const properties = overriddenProperties(rule);
  return element(
    'rule',
    { ref: `${rule.source}/${rule.name}`, ...(message === undefined ? {} : { message }) },
    [
      ...(priority === undefined ? [] : [textElement('priority', priority)]),
      ...(properties.length === 0 ? [] : [element('properties', {}, properties)]),
    ],
  );
}

export function renderedRuleset(
  name: string,
  { include, exclude }: RulesetScope,
  rules: readonly ResolvedRule[],
): string {
  const ruleset = element('ruleset', { name, xmlns: NAMESPACE }, [
    textElement('description', name),
    ...exclude.map((pattern) => textElement('exclude-pattern', pattern)),
    ...include.map((pattern) => textElement('include-pattern', pattern)),
    ...rules.map(ruleReference),
  ]);
  return `${DECLARATION}${renderXml(ruleset)}\n`;
}

export function onlyFiles(files: readonly string[]): RulesetScope {
  return { exclude: [EVERY_FILE], include: files.map((file) => String.raw`\Q${file}\E`) };
}
