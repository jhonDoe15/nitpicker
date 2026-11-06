import { describe, expect, it } from 'vitest';
import {
  file,
  fn,
  klass,
  parameter,
  property,
  routeOf,
  run,
  summary,
} from '../test-support/facts.mjs';
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
      'If this is intended, add {"rule":"pmd/SingularAndPluralMember","paths":["src/main/kotlin/demo/Sample.kt"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
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

  it('reports a plain class with a public property and its plural', () => {
    const plain = klass('Query', {
      primaryParameters: [
        member('child', 'Node', { visibility: 'public' }),
        member('children', 'List<Node>', { visibility: 'internal', line: 4 }),
      ],
    });

    expect(summary(findingsFor([plain]))).toEqual([`${SINGULAR_PLURAL_RULE} Query.children 4`]);
  });

  it.each([
    ['private properties', {}, 'private'],
    ['protected properties', {}, 'protected'],
    ['properties without a known visibility', {}, undefined],
    ['a private class', { visibility: 'private' }, 'public'],
    ['an entity', { annotations: [{ name: 'Entity', text: '@Entity' }] }, 'public'],
    ['an object', { kind: 'object' }, 'public'],
    ['a Spring stereotype', { annotations: [{ name: 'Service', text: '@Service' }] }, 'public'],
  ])('allows a plain class with %s', (_name, overrides, visibility) => {
    const plain = klass('Router', {
      primaryParameters: [
        member('route', 'String', { visibility }),
        member('routes', 'List<String>', { visibility }),
      ],
      ...overrides,
    });

    expect(findingsFor([plain])).toEqual([]);
  });

  it('allows a plain class with behaviour, such as a router over a default and all routes', () => {
    const router = klass('Router', {
      primaryParameters: [
        member('route', 'String', { visibility: 'public' }),
        member('routes', 'List<String>', { visibility: 'public' }),
      ],
    });
    const resolve = fn('resolve', { owner: 'Router' });

    expect(
      run(singularPluralFindings, [file({ classes: [router], functions: [resolve] })]),
    ).toEqual([]);
  });

  it('reports defaulted constructor parameters of a public class', () => {
    const query = klass('Query', {
      primaryParameters: [
        parameter('tag', 'String?', { default: true }),
        parameter('tags', 'List<String>', { default: true, line: 3 }),
      ],
    });

    expect(summary(findingsFor([query]))).toEqual([`${SINGULAR_PLURAL_RULE} Query.tags 3`]);
  });

  it('reports defaulted parameters of public functions and constructors', () => {
    const findings = run(singularPluralFindings, [
      file({
        functions: [
          fn('send', {
            parameters: [
              parameter('recipient', 'String?', { default: true }),
              parameter('recipients', 'List<String>', { default: true, line: 4 }),
            ],
          }),
          fn('<init>', {
            owner: 'Mailer',
            parameters: [
              parameter('box', 'Box?', { default: true }),
              parameter('boxes', 'Set<Box>?', { default: true, line: 9 }),
            ],
          }),
        ],
      }),
    ]);

    expect(summary(findings)).toEqual([
      `${SINGULAR_PLURAL_RULE} send.recipients 4`,
      `${SINGULAR_PLURAL_RULE} Mailer.<init>.boxes 9`,
    ]);
  });

  it.each([
    ['required parameters', {}, false],
    ['a private function', { visibility: 'private' }, true],
    ['an internal function', { visibility: 'internal' }, true],
    ['a local function', { local: true }, true],
    ['an override', { modifiers: ['override'] }, true],
    ['a protected function', { modifiers: ['protected'] }, true],
  ])('allows %s', (_name, overrides, defaulted) => {
    const send = fn('contains', {
      parameters: [
        parameter('role', 'String', { default: defaulted }),
        parameter('roles', 'Set<String>', { default: defaulted }),
      ],
      ...overrides,
    });

    expect(run(singularPluralFindings, [file({ functions: [send] })])).toEqual([]);
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
