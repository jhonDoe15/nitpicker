import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  childrenNamed,
  parseXml,
  type XmlElement,
} from '../../../../../shared/ingest/report-records.mts';
import { readZip, type Zip } from '../../zip-entries.mts';

export type ResolvedRule = {
  readonly name: string;
  readonly source: string;
  readonly definition: XmlElement;
  readonly overrides: readonly XmlElement[];
};
export type ResolvedRuleset = {
  readonly name: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly rules: readonly ResolvedRule[];
};
export type RulesetReader = (reference: string) => string;

const SHIPPED_PREFIX = 'category/';
const WHOLE_RULESET = /\.xml$/u;
const ONE_RULE = /^(?<file>.+\.xml)\/(?<rule>[^/]+)$/u;
const MAX_DEPTH = 20;

export function rulesetReader(pmdJar: string): RulesetReader {
  const jar: { zip?: Zip } = {};
  return (reference) => {
    if (path.isAbsolute(reference) && existsSync(reference)) {
      return readFileSync(reference, 'utf8');
    }
    if (!reference.startsWith(SHIPPED_PREFIX)) {
      throw new Error(`cannot tell where the PMD ruleset ${reference} is`);
    }
    jar.zip ??= readZip(pmdJar);
    const text = jar.zip.text(reference);
    if (text === undefined) {
      throw new Error(`${pmdJar} has no ruleset ${reference}`);
    }
    return text;
  };
}

function patternsOf(ruleset: XmlElement, kind: string): string[] {
  return childrenNamed(ruleset, kind).map(({ text }) => (text ?? '').trim());
}

function excludedNames(rule: XmlElement): Set<string> {
  return new Set(childrenNamed(rule, 'exclude').map(({ attrs }) => attrs['name'] ?? ''));
}

function withRule(rules: readonly ResolvedRule[], added: ResolvedRule): ResolvedRule[] {
  return [...rules.filter(({ name }) => name !== added.name), added];
}

export function resolvedRulesets(read: RulesetReader): (reference: string) => ResolvedRuleset {
  const known = new Map<string, ResolvedRuleset>();

  function oneRule(element: XmlElement, depth: number): ResolvedRule {
    const { file = '', rule = '' } = ONE_RULE.exec(element.attrs['ref'] ?? '')?.groups ?? {};
    const target = resolve(file, depth + 1).rules.find(({ name }) => name === rule);
    if (target === undefined || (element.attrs['name'] ?? rule) !== rule) {
      throw new Error(`cannot follow the PMD rule reference ${element.attrs['ref'] ?? ''}`);
    }
    return { ...target, overrides: [...target.overrides, element] };
  }

  function wholeRuleset(element: XmlElement, depth: number): ResolvedRule[] {
    const skipped = excludedNames(element);
    return resolve(element.attrs['ref'] ?? '', depth + 1).rules.filter(
      ({ name, definition }) => !skipped.has(name) && definition.attrs['deprecated'] !== 'true',
    );
  }

  function rulesOf(reference: string, ruleset: XmlElement, depth: number): ResolvedRule[] {
    let rules: ResolvedRule[] = [];
    for (const element of childrenNamed(ruleset, 'rule')) {
      const { ref, name = '' } = element.attrs;
      if (ref === undefined) {
        rules = withRule(rules, { name, source: reference, definition: element, overrides: [] });
      } else if (WHOLE_RULESET.test(ref)) {
        const present = new Set(rules.map((rule) => rule.name));
        rules = [...rules, ...wholeRuleset(element, depth).filter((rule) => !present.has(rule.name))];
      } else if (element.attrs['deprecated'] !== 'true') {
        rules = withRule(rules, oneRule(element, depth));
      }
    }
    return rules;
  }

  function resolve(reference: string, depth: number): ResolvedRuleset {
    const cached = known.get(reference);
    if (cached !== undefined) {
      return cached;
    }
    if (depth > MAX_DEPTH) {
      throw new Error(`the PMD ruleset ${reference} refers to itself`);
    }
    const ruleset = parseXml(read(reference));
    const resolved = {
      name: ruleset.attrs['name'] ?? '',
      include: patternsOf(ruleset, 'include-pattern'),
      exclude: patternsOf(ruleset, 'exclude-pattern'),
      rules: rulesOf(reference, ruleset, depth),
    };
    known.set(reference, resolved);
    return resolved;
  }

  return (reference) => resolve(reference, 0);
}
