import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KOTLIN_EXCEPTION_RULES, validateKotlinOptions } from './kotlin-options.mjs';
import { KOTLIN_SPRING_RULE_IDS } from './spring/spring-rules.mjs';

const JAVA_RULESET = path.resolve(import.meta.dirname, '../../gradle/spring-ruleset.xml');

function exceptionFor(rule) {
  return {
    preset: 'kotlin',
    exceptions: [{ rule, paths: ['src/**'], reason: 'covered elsewhere' }],
  };
}

describe('exceptions of the kotlin preset for Spring', () => {
  it('lifts a Kotlin Spring rule and a Spring configuration rule per path', () => {
    expect(
      [
        'pmd/SpringNoCrossOrigin',
        'pmd/JpaVersion',
        'pmd/SpringHttpClientTimeouts',
        'pmd/JpaEnumString',
        'spring/ddl-auto',
        'spring/open-in-view',
      ].map((rule) => {
        validateKotlinOptions(exceptionFor(rule));
      }),
    ).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  it('rejects a Spring rule that does not exist and names the rules that do', () => {
    expect(() => {
      validateKotlinOptions(exceptionFor('pmd/SpringNoSuchRule'));
    }).toThrow(
      `nitpicker.config.json: "exceptions[0].rule" is "pmd/SpringNoSuchRule", which is not a rule with exceptions. Write the rule as the finding prints it; rules with exceptions for the kotlin preset: detekt.<ruleset>.<Rule>, ${KOTLIN_EXCEPTION_RULES.join(', ')}`,
    );
  });

  it('gives every rule of the Java Spring ruleset the same exception id on Kotlin', () => {
    const javaRules = [...readFileSync(JAVA_RULESET, 'utf8').matchAll(/<rule name="(\w+)"/g)].map(
      ([, name]) => `pmd/${name}`,
    );

    expect(KOTLIN_SPRING_RULE_IDS.toSorted()).toEqual(javaRules.toSorted());
  });

  it('lists each exception id once', () => {
    expect(KOTLIN_EXCEPTION_RULES.length).toBe(new Set(KOTLIN_EXCEPTION_RULES).size);
  });
});
