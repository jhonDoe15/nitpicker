import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROXIED } from '../../kotlin/review-rules/spring/spring-types.mjs';
import { CONSTRAINT_NAMES } from '../../kotlin/review-rules/validation/constraint-names.mjs';
import { SPRING_RULESET, springRuleset, writeSpringRuleset } from './proxy-ruleset.mjs';

const ruleset = readFileSync(SPRING_RULESET, 'utf8');
const roots = [];

function xpathOf(rule) {
  const start = ruleset.indexOf(`<rule name="${rule}"`);
  return ruleset.slice(start, ruleset.indexOf('</rule>', start));
}

function quoted(text) {
  return [...text.matchAll(/'([\w.$]+)'/gu)].map((match) => match[1]);
}

function listOf(xpath, from, to) {
  return quoted(xpath.slice(xpath.indexOf(from), xpath.indexOf(to, xpath.indexOf(from))));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.each(['SpringProxyMethodVisibility', 'SpringProxySelfCall'])('%s', (rule) => {
  const xpath = xpathOf(rule);

  it('lists the proxied annotations the Kotlin rules know', () => {
    expect(listOf(xpath, '$proxyNames :=', '$projectProxyAnnotations').sort()).toEqual(
      [...PROXIED].sort(),
    );
  });

  it('lists the Bean Validation and Hibernate Validator constraints', () => {
    const names = (from, to) => listOf(xpath, from, to).filter((name) => !name.includes('.'));

    expect(names('$constraintNames :=', 'return')).toEqual(
      CONSTRAINT_NAMES['jakarta.validation.constraints'],
    );
    expect(names("'javax.validation.constraints.' ||", 'return')).toEqual(
      CONSTRAINT_NAMES['org.hibernate.validator.constraints'],
    );
  });
});

describe('springRuleset', () => {
  it('passes the project annotations to both proxy rules and keeps the other Spring rules', () => {
    const text = springRuleset({ proxied: ['shop.Audited', 'shop.Outer$Later'], constraints: [] });

    expect([...text.matchAll(/<rule ref="([^"]+)"/gu)].map((match) => match[1])).toEqual([
      SPRING_RULESET,
      `${SPRING_RULESET}/SpringProxyMethodVisibility`,
      `${SPRING_RULESET}/SpringProxySelfCall`,
    ]);
    expect(text.match(/<exclude name="(\w+)"\/>/gu)).toEqual([
      '<exclude name="SpringProxyMethodVisibility"/>',
      '<exclude name="SpringProxySelfCall"/>',
    ]);
    expect(text.match(/<property name="\w+" value="[^"]*"\/>/gu)).toEqual([
      '<property name="projectProxyAnnotations" value="shop.Audited,shop.Outer$Later"/>',
      '<property name="projectConstraintAnnotations" value=""/>',
      '<property name="projectProxyAnnotations" value="shop.Audited,shop.Outer$Later"/>',
      '<property name="projectConstraintAnnotations" value=""/>',
    ]);
  });

  it('writes nothing for a project without annotations of its own, so the shipped rule set applies', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'proxy-ruleset-'));
    roots.push(root);

    expect(writeSpringRuleset(root, root)).toBeUndefined();
  });
});
