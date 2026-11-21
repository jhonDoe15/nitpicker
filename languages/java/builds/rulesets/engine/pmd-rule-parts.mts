import { childrenNamed, type XmlElement } from '../../../../../shared/ingest/report-records.mts';
import type { ResolvedRule } from './pmd-catalog.mts';

export type EngineRule = {
  readonly name: string;
  readonly xpath: string;
  readonly message: string;
  readonly suppress: string;
  readonly properties: Readonly<Record<string, { readonly type: string; readonly value: string }>>;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};
export type RuleProperty = { readonly type: string; readonly value: string };

const XPATH_RULE = 'net.sourceforge.pmd.lang.rule.xpath.XPathRule';
const QUERY = 'xpath';
const SUPPRESS_QUERY = 'violationSuppressXPath';
const SUPPRESS_REGEX = 'violationSuppressRegex';
const ERROR_PRIORITIES = new Set(['1', '2']);
const WARNING_PRIORITY = '3';
const DEFAULT_PRIORITY = '5';
const QUOTED_SECTION = /\\Q(?<literal>[\s\S]*?)(?:\\E|$)/gu;
const REGEX_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;

function propertyElements(element: XmlElement): XmlElement[] {
  return childrenNamed(element, 'properties').flatMap((group) => childrenNamed(group, 'property'));
}

function valueOf(property: XmlElement): string {
  return property.attrs['value'] ?? childrenNamed(property, 'value')[0]?.text ?? '';
}

export function ruleProperties({ definition, overrides }: ResolvedRule): Map<string, RuleProperty> {
  const properties = new Map<string, RuleProperty>();
  for (const element of [definition, ...overrides]) {
    for (const property of propertyElements(element)) {
      const name = property.attrs['name'] ?? '';
      const type = properties.get(name)?.type || (property.attrs['type'] ?? '');
      properties.set(name, { type, value: valueOf(property) });
    }
  }
  return properties;
}

export function overriddenProperties({ overrides }: ResolvedRule): XmlElement[] {
  const properties = new Map<string, XmlElement>();
  for (const property of overrides.flatMap(propertyElements)) {
    properties.set(property.attrs['name'] ?? '', property);
  }
  return [...properties.values()];
}

function lastOf<Value>(values: readonly (Value | undefined)[]): Value | undefined {
  return values.findLast((value) => value !== undefined);
}

export function overriddenMessage({ overrides }: ResolvedRule): string | undefined {
  return lastOf(overrides.map(({ attrs }) => attrs['message']));
}

export function overriddenPriority({ overrides }: ResolvedRule): string | undefined {
  return lastOf(overrides.map((element) => childrenNamed(element, 'priority')[0]?.text?.trim()));
}

export function ruleMessage(rule: ResolvedRule): string {
  return overriddenMessage(rule) ?? rule.definition.attrs['message'] ?? '';
}

export function ruleLevel(rule: ResolvedRule): 'error' | 'warning' | 'note' {
  const priority =
    overriddenPriority(rule) ??
    childrenNamed(rule.definition, 'priority')[0]?.text?.trim() ??
    DEFAULT_PRIORITY;
  if (ERROR_PRIORITIES.has(priority)) {
    return 'error';
  }
  return priority === WARNING_PRIORITY ? 'warning' : 'note';
}

export function runsOnEngine(rule: ResolvedRule): boolean {
  const { attrs } = rule.definition;
  const properties = ruleProperties(rule);
  return (
    attrs['class'] === XPATH_RULE &&
    attrs['language'] === 'java' &&
    attrs['maximumLanguageVersion'] === undefined &&
    (properties.get(QUERY)?.value ?? '').trim() !== '' &&
    (properties.get(SUPPRESS_REGEX)?.value ?? '') === ''
  );
}

export function portablePattern(javaPattern: string): string {
  return javaPattern.replaceAll(QUOTED_SECTION, (...match) => {
    const groups: unknown = match.at(-1);
    const literal =
      typeof groups === 'object' && groups !== null && 'literal' in groups ? groups.literal : '';
    return String(literal).replaceAll(REGEX_SPECIAL, String.raw`\$&`);
  });
}

export function engineRule(
  rule: ResolvedRule,
  scope: { readonly include: readonly string[]; readonly exclude: readonly string[] },
): EngineRule {
  const properties = ruleProperties(rule);
  return {
    name: rule.name,
    xpath: properties.get(QUERY)?.value ?? '',
    message: ruleMessage(rule),
    suppress: properties.get(SUPPRESS_QUERY)?.value ?? '',
    properties: Object.fromEntries(
      [...properties].filter(([name]) => ![QUERY, SUPPRESS_QUERY, SUPPRESS_REGEX].includes(name)),
    ),
    include: scope.include.map(portablePattern),
    exclude: scope.exclude.map(portablePattern),
  };
}
