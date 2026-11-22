import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  childrenNamed,
  parseXml,
  type XmlElement,
} from '../../../../../shared/ingest/report-records.mts';
import { readZip, type Zip } from '../../../../../shared/archives/zip-entries.mts';
import { reachableFrom } from '../../../../../shared/lists/lists.mts';
import { excludedNames } from '../../../adapters/tool-config/pmd/pmd-rule-elements.mts';

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

type Known = Map<string, ResolvedRuleset>;

function patternsOf(ruleset: XmlElement, kind: string): string[] {
  return childrenNamed(ruleset, kind).map(({ text }) => (text ?? '').trim());
}

function withRule(rules: readonly ResolvedRule[], added: ResolvedRule): ResolvedRule[] {
  return [...rules.filter(({ name }) => name !== added.name), added];
}

function referencesIn(ruleset: XmlElement): string[] {
  return childrenNamed(ruleset, 'rule').flatMap(({ attrs }) => {
    const ref = attrs['ref'];
    if (ref === undefined) {
      return [];
    }
    if (WHOLE_RULESET.test(ref)) {
      return [ref];
    }
    return attrs['deprecated'] === 'true' ? [] : [ONE_RULE.exec(ref)?.groups?.['file'] ?? ''];
  });
}

function oneRule(element: XmlElement, known: Known): ResolvedRule {
  const { file = '', rule = '' } = ONE_RULE.exec(element.attrs['ref'] ?? '')?.groups ?? {};
  const target = known.get(file)?.rules.find(({ name }) => name === rule);
  if (target === undefined || (element.attrs['name'] ?? rule) !== rule) {
    throw new Error(`cannot follow the PMD rule reference ${element.attrs['ref'] ?? ''}`);
  }
  return { ...target, overrides: [...target.overrides, element] };
}

function wholeRuleset(element: XmlElement, known: Known): ResolvedRule[] {
  const skipped = excludedNames(element);
  return (known.get(element.attrs['ref'] ?? '')?.rules ?? []).filter(
    ({ name, definition }) => !skipped.has(name) && definition.attrs['deprecated'] !== 'true',
  );
}

function rulesOf(reference: string, ruleset: XmlElement, known: Known): ResolvedRule[] {
  let rules: ResolvedRule[] = [];
  for (const element of childrenNamed(ruleset, 'rule')) {
    const { ref, name = '' } = element.attrs;
    if (ref === undefined) {
      rules = withRule(rules, { name, source: reference, definition: element, overrides: [] });
    } else if (WHOLE_RULESET.test(ref)) {
      const present = new Set(rules.map((rule) => rule.name));
      rules = [...rules, ...wholeRuleset(element, known).filter((rule) => !present.has(rule.name))];
    } else if (element.attrs['deprecated'] !== 'true') {
      rules = withRule(rules, oneRule(element, known));
    }
  }
  return rules;
}

function readRulesets(
  read: RulesetReader,
  known: Known,
  reference: string,
): Map<string, XmlElement> {
  const parsed = new Map<string, XmlElement>();
  reachableFrom([reference], (next) => {
    if (known.has(next)) {
      return [];
    }
    const ruleset = parseXml(read(next));
    parsed.set(next, ruleset);
    return referencesIn(ruleset);
  });
  return parsed;
}

function resolveInOrder(parsed: ReadonlyMap<string, XmlElement>, known: Known): void {
  const waiting = new Map(parsed);
  let stuck = 0;
  for (const [reference, ruleset] of waiting) {
    waiting.delete(reference);
    if (referencesIn(ruleset).every((ref) => known.has(ref))) {
      known.set(reference, {
        name: ruleset.attrs['name'] ?? '',
        include: patternsOf(ruleset, 'include-pattern'),
        exclude: patternsOf(ruleset, 'exclude-pattern'),
        rules: rulesOf(reference, ruleset, known),
      });
      stuck = 0;
    } else if (stuck >= waiting.size) {
      throw new Error(`the PMD ruleset ${reference} refers to itself`);
    } else {
      stuck += 1;
      waiting.set(reference, ruleset);
    }
  }
}

export function resolvedRulesets(read: RulesetReader): (reference: string) => ResolvedRuleset {
  const known: Known = new Map();
  return (reference) => {
    resolveInOrder(readRulesets(read, known, reference), known);
    const resolved = known.get(reference);
    if (resolved === undefined) {
      throw new Error(`cannot read the PMD ruleset ${reference}`);
    }
    return resolved;
  };
}
