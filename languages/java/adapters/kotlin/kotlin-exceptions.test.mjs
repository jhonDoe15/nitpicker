import { describe, expect, it } from 'vitest';
import { JAVA_TOOLS } from '../gradle-presets.mjs';
import { KOTLIN_EXCEPTION_RULES, validateKotlinOptions } from './kotlin-options.mjs';

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

  it('rejects a Spring rule written without its tool and names the rules that exist', () => {
    expect(() => {
      validateKotlinOptions(exceptionFor('SpringConstructorInjection'));
    }).toThrow(
      `"exceptions[0].rule" is "SpringConstructorInjection", which is not a rule with exceptions. Write the rule as the finding prints it; rules with exceptions for the kotlin preset: detekt.<ruleset>.<Rule>, ${KOTLIN_EXCEPTION_RULES.join(', ')}, and, for the Java sources of the project, a finding as it is printed, "<tool>/<rule>" (for example "pmd/UnusedPrivateField"; tools: ${JAVA_TOOLS.join(', ')})`,
    );
  });

  it('lists each exception id once', () => {
    expect(KOTLIN_EXCEPTION_RULES.length).toBe(new Set(KOTLIN_EXCEPTION_RULES).size);
  });
});
