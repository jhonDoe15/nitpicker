import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { file, klass, parameter, routed, run, summary, testFile } from '../test-support/facts.mjs';
import { VALIDATION_TARGET_RULE, validationTargetFindings } from './validation-targets.mjs';

const FACTS = path.resolve(import.meta.dirname, '../../../fixtures/kotlin-spring-facts.json');
const CONSTRAINTS = { path: 'jakarta.validation.constraints.NotBlank' };
const annotation = (name, target, type = name) => ({ name, type, target, arguments: [] });
const member = (entries, overrides = {}) =>
  parameter('item', 'String', {
    property: 'val',
    line: 4,
    annotationEntries: entries,
    ...overrides,
  });
const request = (parameters) =>
  klass('OrderRequest', { data: true, primaryParameters: parameters });
const findingsFor = (parameters, imports = [CONSTRAINTS]) =>
  run(validationTargetFindings, [file({ imports, classes: [request(parameters)] })]);

describe('validation annotations on Kotlin constructor properties', () => {
  it('reports a constraint without a use-site target, with the @field: form and exception route', () => {
    const findings = findingsFor([member([annotation('NotBlank')])]);

    expect(summary(findings)).toEqual([`${VALIDATION_TARGET_RULE} OrderRequest.item 4`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toBe(
      routed(
        'Write @field:NotBlank on this constructor property. Without a use-site target Kotlin puts the annotation on the constructor parameter, where Bean Validation does not look, so @Valid checks nothing.',
        VALIDATION_TARGET_RULE,
      ),
    );
  });

  it.each([
    ['a param: target', [annotation('NotBlank', 'param')], [CONSTRAINTS]],
    ['a set: target', [annotation('NotBlank', 'set')], [CONSTRAINTS]],
    [
      'a star import of javax constraints',
      [annotation('Size')],
      [{ path: 'javax.validation.constraints', all: true }],
    ],
    [
      'a Hibernate Validator constraint',
      [annotation('Length')],
      [{ path: 'org.hibernate.validator.constraints.Length' }],
    ],
    [
      'a fully qualified constraint',
      [annotation('NotNull', undefined, 'jakarta.validation.constraints.NotNull')],
      [],
    ],
    ['an aliased constraint', [annotation('Required')], [{ ...CONSTRAINTS, alias: 'Required' }]],
    ['@Valid on a nested property', [annotation('Valid')], [{ path: 'jakarta.validation.Valid' }]],
    [
      'a constraint after a targeted one',
      [annotation('Size', 'field'), annotation('NotBlank')],
      [{ path: 'jakarta.validation.constraints', all: true }],
    ],
  ])('reports %s', (_name, entries, imports) => {
    expect(findingsFor([member(entries)], imports)).toHaveLength(1);
  });

  it.each([
    ['a field: target', [member([annotation('NotBlank', 'field')])], [CONSTRAINTS]],
    ['a get: target', [member([annotation('NotBlank', 'get')])], [CONSTRAINTS]],
    ['an all: target', [member([annotation('NotBlank', 'all')])], [CONSTRAINTS]],
    [
      'a parameter that is not a property',
      [member([annotation('NotBlank')], { property: undefined })],
      [CONSTRAINTS],
    ],
    [
      'an annotation from another package',
      [member([annotation('NotBlank')])],
      [{ path: 'demo.checks.NotBlank' }],
    ],
    ['a Kotlin annotation', [member([annotation('JvmField')])], []],
    ['no annotations', [member(undefined)], [CONSTRAINTS]],
  ])('allows %s', (_name, parameters, imports) => {
    expect(findingsFor(parameters, imports)).toEqual([]);
  });

  it('leaves test sources alone', () => {
    const files = [
      testFile({ imports: [CONSTRAINTS], classes: [request([member([annotation('NotBlank')])])] }),
    ];

    expect(run(validationTargetFindings, files)).toEqual([]);
  });

  it('reads the use-site targets the Kotlin parser records, grouped ones included', () => {
    const { files } = JSON.parse(readFileSync(FACTS, 'utf8'));
    const requests = files.filter(({ file: name }) => name.endsWith('/Requests.kt'));

    expect(requests).toHaveLength(2);
    expect(summary(run(validationTargetFindings, requests))).toEqual([
      `${VALIDATION_TARGET_RULE} Address.city 6`,
      `${VALIDATION_TARGET_RULE} SignupRequest.email 9`,
      `${VALIDATION_TARGET_RULE} SignupRequest.name 10`,
      `${VALIDATION_TARGET_RULE} SignupRequest.address 11`,
    ]);
  });
});
