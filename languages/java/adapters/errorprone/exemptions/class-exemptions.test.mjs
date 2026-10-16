import { describe, expect, it } from 'vitest';
import { CHECKS } from '../checks/checks-docs.mjs';
import { isClassExempt } from './class-exemptions.mjs';

const FINAL = '[FieldCanBeFinal] This field is only assigned during initialization';
const UTILITY =
  '[PrivateConstructorForUtilityClass] Classes which are not intended to be instantiated';
const exempt = (message, classAnnotations) =>
  isClassExempt({ message, classAnnotations }, CHECKS.classExemptions);

describe('class exemptions', () => {
  it('drops FieldCanBeFinal inside JPA entity, embeddable and mapped superclass classes only', () => {
    expect([
      exempt(FINAL, ['jakarta.persistence.Entity']),
      exempt(FINAL, ['javax.persistence.Embeddable']),
      exempt(FINAL, ['jakarta.persistence.MappedSuperclass']),
      exempt(FINAL, ['lombok.Data']),
      exempt(FINAL, []),
      exempt(FINAL, undefined),
    ]).toStrictEqual([true, true, true, false, false, false]);
  });

  it('drops PrivateConstructorForUtilityClass on Spring configuration and ArchUnit classes only', () => {
    expect([
      exempt(UTILITY, [
        'org.springframework.boot.autoconfigure.SpringBootApplication',
        'org.springframework.boot.SpringBootConfiguration',
        'org.springframework.context.annotation.Configuration',
      ]),
      exempt(UTILITY, [
        'org.springframework.boot.test.context.TestConfiguration',
        'org.springframework.context.annotation.Configuration',
      ]),
      exempt(UTILITY, ['com.tngtech.archunit.junit.AnalyzeClasses']),
      exempt(UTILITY, ['org.springframework.stereotype.Service']),
      exempt(UTILITY, ['jakarta.persistence.Entity']),
    ]).toStrictEqual([true, true, true, false, false]);
  });

  it('keeps every other check, whatever the class is annotated with', () => {
    expect(exempt('[MethodCanBeStatic] Can be static', ['jakarta.persistence.Entity'])).toBe(false);
  });
});
