import { childrenNamed } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import type { RuleReference } from '../pmd-types.mts';

const REFERENCE = /^(.+?\.xml)(?:\/([^/]+))?$/;
const ASSERT_PROPERTY = 'extraAssertMethodNames';

export function referenceOf(rule: XmlElement): RuleReference {
  const match = REFERENCE.exec(rule.attrs['ref'] ?? '');
  return match === null
    ? { file: rule.attrs['ref'] ?? '', rule: rule.attrs['name'] }
    : { file: match[1] ?? '', rule: match[2] };
}

export function excludedNames(rule: XmlElement): Set<string> {
  return new Set(childrenNamed(rule, 'exclude').map(({ attrs }) => attrs['name'] ?? ''));
}

export function withHelpers(rule: XmlElement, helpers: readonly string[]): XmlElement {
  const groups = rule.children.map((group) => ({
    ...group,
    children: group.children.map((property) =>
      property.attrs['name'] === ASSERT_PROPERTY
        ? {
            ...property,
            attrs: {
              ...property.attrs,
              value: [
                ...new Set([
                  ...(property.attrs['value'] ?? '').split(',').filter(Boolean),
                  ...helpers,
                ]),
              ].join(','),
            },
          }
        : property,
    ),
  }));
  return { ...rule, children: groups };
}

export function scopedRulesOf(
  ruleset: XmlElement,
): { file: string; rule: string | undefined; element: XmlElement }[] {
  return childrenNamed(ruleset, 'rule').map((rule) => ({
    ...referenceOf(rule),
    element: rule,
  }));
}
