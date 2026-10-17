import { describe, expect, it } from 'vitest';
import { file, klass, parameter, property, routeOf, run, summary } from '../test-support/facts.mjs';
import { SINGULAR_PLURAL_RULE, singularPluralFindings } from './member-names.mjs';

const member = (name, type, overrides = {}) =>
  parameter(name, type, { property: 'val', ...overrides });
const dataClass = (parameters, overrides = {}) =>
  klass('Query', { data: true, primaryParameters: parameters, ...overrides });
const findingsFor = (classes, properties = []) =>
  run(singularPluralFindings, [file({ classes, properties })]);

describe('singular and plural members in Kotlin', () => {
  it('reports a data class with tag and tags, with the Java rule id and exception route', () => {
    const findings = findingsFor([
      dataClass([member('tag', 'String'), member('tags', 'List<String>', { line: 7 })]),
    ]);

    expect(summary(findings)).toEqual([`${SINGULAR_PLURAL_RULE} Query.tags 7`]);
    expect(findings[0].tool).toBe('pmd');
    expect(routeOf(findings[0].message)).toBe(
      'add an exception for pmd/SingularAndPluralMember in nitpicker.config.json.',
    );
  });

  it.each([
    ['a set', 'tag', 'String', 'tags', 'Set<String>'],
    ['a nullable list', 'tag', 'String?', 'tags', 'List<String>?'],
    ['an array', 'tag', 'String', 'tags', 'Array<String>'],
    ['a primitive array', 'id', 'Int', 'ids', 'IntArray'],
    ['an es plural', 'box', 'Box', 'boxes', 'List<Box>'],
    ['a y plural', 'entry', 'Entry', 'entries', 'List<Entry>'],
  ])('reports %s', (_name, singular, singularType, plural, pluralType) => {
    const findings = findingsFor([
      dataClass([member(singular, singularType), member(plural, pluralType)]),
    ]);

    expect(findings).toHaveLength(1);
  });

  it.each([
    ['a different element type', [member('tag', 'Int'), member('tags', 'List<String>')]],
    ['unrelated names', [member('tag', 'String'), member('labels', 'List<String>')]],
    ['a varargs plural', [member('tag', 'String'), member('tags', 'String', { vararg: true })]],
    ['a plural that is not a collection', [member('tag', 'String'), member('tags', 'String')]],
    ['no singular', [member('names', 'List<String>'), member('tags', 'List<String>')]],
    [
      'a parameter that is not a property',
      [parameter('tag', 'String'), member('tags', 'List<String>')],
    ],
  ])('allows %s', (_name, parameters) => {
    expect(findingsFor([dataClass(parameters)])).toEqual([]);
  });

  it('allows a plain class that is not a data class or configuration properties', () => {
    const plain = klass('Query', {
      primaryParameters: [member('tag', 'String'), member('tags', 'List<String>')],
    });

    expect(findingsFor([plain])).toEqual([]);
  });

  it('checks configuration properties classes, their body properties and nested classes', () => {
    const properties = klass('ShopProperties', {
      annotations: [{ name: 'ConfigurationProperties', text: '@ConfigurationProperties("shop")' }],
    });
    const nested = klass('Mail', { qualified: 'ShopProperties.Mail' });
    const findings = findingsFor(
      [properties, nested],
      [
        property('host', 'ShopProperties', { type: 'String' }),
        property('hosts', 'ShopProperties', { type: 'List<String>', var: true, line: 5 }),
        property('tag', 'ShopProperties.Mail'),
        property('tags', 'ShopProperties.Mail', { type: 'MutableList<String>', line: 9 }),
        property('cached', 'ShopProperties', { type: 'List<String>', delegated: true }),
      ],
    );

    expect(summary(findings)).toEqual([
      `${SINGULAR_PLURAL_RULE} ShopProperties.hosts 5`,
      `${SINGULAR_PLURAL_RULE} ShopProperties.Mail.tags 9`,
    ]);
  });

  it('ignores test sources', () => {
    const test = file({
      file: 'src/test/kotlin/demo/QueryTest.kt',
      test: true,
      classes: [dataClass([member('tag', 'String'), member('tags', 'List<String>')])],
    });

    expect(run(singularPluralFindings, [test])).toEqual([]);
  });
});
