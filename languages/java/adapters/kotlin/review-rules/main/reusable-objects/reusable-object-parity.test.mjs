import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CACHING_CALLS,
  CONSTANT_PATTERN_FACTORIES,
  REUSABLE_CONSTRUCTORS,
  REUSABLE_FACTORIES,
  REUSABLE_OBJECT_MESSAGE,
  REUSABLE_OBJECT_RULE,
  REUSABLE_RESULT_TYPES,
  SETUP_ANNOTATIONS,
  SETUP_METHODS,
  STORING_CALLS,
} from '../../../../../messages/reuse/reusable-objects.mjs';

const RULE_FILE = path.resolve(
  import.meta.dirname,
  `../../../../../gradle/rulesets/pmd-main-ruleset/${REUSABLE_OBJECT_RULE}.xml`,
);
const rule = readFileSync(RULE_FILE, 'utf8');
const xpath = rule.slice(rule.indexOf('<![CDATA['), rule.indexOf(']]>'));

function section(from, to) {
  const start = xpath.indexOf(from);
  return xpath.slice(start, to === undefined ? undefined : xpath.indexOf(to, start + 1));
}

function typesIn(text) {
  return [...text.matchAll(/typeIs\('([^']+)'\)/gu)].map(([, type]) => type).sort();
}

function listOf(name) {
  const match = new RegExp(`\\$${name} := \\(([^)]*)\\)`, 'u').exec(xpath);
  return [...match[1].matchAll(/'([^']+)'/gu)].map(([, value]) => value);
}

function methodNames(text) {
  const match = /@MethodName = (?:\(([^)]*)\)|'([^']+)')/u.exec(text);
  return match[1] === undefined
    ? [match[2]]
    : [...match[1].matchAll(/'([^']+)'/gu)].map(([, value]) => value);
}

function factoryPairs() {
  const calls = section('| //MethodCall[@MethodName', '| //MethodCall[pmd-java:matchesSig');
  return calls
    .split('| //MethodCall')
    .filter((part) => part.includes('@MethodName'))
    .flatMap((part) =>
      typesIn(part).flatMap((type) => methodNames(part).map((name) => `${type}#${name}`)),
    )
    .sort();
}

describe('ReusableObjectPerCall: the Java rule and the shared type list agree', () => {
  it('uses the shared message', () => {
    expect(/message="([^"]*)"/u.exec(rule)[1]).toBe(REUSABLE_OBJECT_MESSAGE);
  });

  it('builds the listed constructors', () => {
    expect(typesIn(section('//ConstructorCall', '| //MethodCall'))).toEqual(
      [...REUSABLE_CONSTRUCTORS].sort(),
    );
  });

  it('calls the listed factories', () => {
    const expected = REUSABLE_FACTORIES.flatMap(([type, names]) =>
      names.map((name) => `${type}#${name}`),
    ).sort();

    expect(factoryPairs()).toEqual(expected);
  });

  it('checks the listed constant-pattern factories', () => {
    const signatures = [...xpath.matchAll(/matchesSig\('([^#']+)#(\w+)\(/gu)].map(
      ([, type, name]) => [type, [name]],
    );

    expect(signatures).toEqual(CONSTANT_PATTERN_FACTORIES);
  });

  it('allows the listed setup places, result types and caches', () => {
    expect(listOf('shared')).toEqual(REUSABLE_RESULT_TYPES);
    expect(listOf('caches')).toEqual(CACHING_CALLS);
    expect(listOf('stores')).toEqual(STORING_CALLS);
    expect(typesIn(section('$start :=', '$setupMethod :='))).toEqual([...SETUP_ANNOTATIONS].sort());
    const named = /\$method\/@Name = \(([^)]*)\)/u.exec(section('$start :=', '$setupMethod :='));

    expect([...named[1].matchAll(/'([^']+)'/gu)].map(([, name]) => name)).toEqual(SETUP_METHODS);
  });
});
