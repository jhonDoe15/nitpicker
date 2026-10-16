import { describe, expect, it } from 'vitest';
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
        'spring/SpringNoCrossOrigin',
        'spring/JpaVersion',
        'spring/ddl-auto',
        'spring/open-in-view',
      ].map((rule) => validateKotlinOptions(exceptionFor(rule))),
    ).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('rejects a Spring rule that does not exist and names the rules that do', () => {
    expect(() => validateKotlinOptions(exceptionFor('spring/SpringNoSuchRule'))).toThrow(
      `"exceptions[0].rule" is "spring/SpringNoSuchRule", which is not a rule with exceptions. Rules with exceptions for the kotlin preset: ${KOTLIN_EXCEPTION_RULES.join(', ')}. Tune any other detekt rule in config/detekt/detekt.yml`,
    );
  });
});
