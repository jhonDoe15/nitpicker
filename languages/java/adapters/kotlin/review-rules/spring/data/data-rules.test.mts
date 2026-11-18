import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  file,
  findingFactory,
  fixtureFacts,
  fn,
  klass,
  parameter,
  property,
  springFindings,
  type Loose,
} from '../spring-test-facts.mts';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = path.join(FIXTURES, 'kotlin-spring-project');
const files = fixtureFacts(path.join(FIXTURES, 'kotlin-spring-facts.json'));
const ENTITY_ANNOTATIONS = ['Entity', 'MappedSuperclass', 'Embeddable'].map(
  (name) => `jakarta.persistence.${name}`,
);
const MANIFEST = {
  spring: true,
  kotlinAllOpen: { annotations: ENTITY_ANNOTATIONS, presets: ['spring'] },
};

function lines(
  projectFiles: Loose[],
  {
    javaRoots = ['src/main/java'],
    manifest = MANIFEST,
  }: { javaRoots?: string[]; manifest?: Loose } = {},
): string[] {
  return springFindings(projectFiles, {
    finding: findingFactory(),
    manifest,
    projectFiles,
    projectRoot: PROJECT,
    javaRoots,
  }).map(
    ({ path: source, location, rule }) =>
      `${path.basename(source)}:${String(location.line)} ${rule}`,
  );
}

function inFixture(name: string): string[] {
  return lines(files).filter((line) => line.startsWith(`${name}:`));
}

function sourceFile(overrides: Loose): Loose {
  return file({
    scopes: [],
    invocations: [],
    locals: [],
    catches: [],
    literals: [],
    nullReturns: [],
    exceptionUses: [],
    throws: [],
    ...overrides,
  });
}

function scope(id: number, k: string, overrides: Loose = {}): Loose {
  return { id, k, ...overrides };
}

describe('Spring Data rules on the forms the review of the Kotlin port found', () => {
  it('reads every allowed form in good/Batches.kt as set-based, read-only or converted', () => {
    expect(
      springFindings(files, {
        finding: findingFactory(),
        manifest: MANIFEST,
        projectFiles: files,
        projectRoot: PROJECT,
        javaRoots: ['src/main/java'],
      }).filter(({ path: source }) => source.endsWith('good/Batches.kt')),
    ).toEqual([]);
  });

  it.each([
    [
      'an enum property with an inferred type or a nested Java enum',
      ['24', '26', '29'],
      'JpaEnumString',
    ],
    ['a fully qualified or linked list under @ManyToMany', ['32', '35'], 'JpaManyToManySet'],
    [
      'a derived query on a revision or implementation repository',
      ['39', '43'],
      'SpringDataDerivedQuery',
    ],
    ['a query built with a template or plus()', ['48', '51'], 'SpringDataQueryTextBlock'],
    [
      'a one-element list with a constructor, a type argument or a local',
      ['64', '65', '68'],
      'SpringDataBatchOfOne',
    ],
    [
      'a member-extension, companion or top-level helper',
      ['70', '71', '72'],
      'SpringDataSaveInLoopHelper',
    ],
    [
      'executeUpdate after createNamedQuery or on a query held in a local',
      ['87', '90'],
      'SpringDataRowWriteInLoop',
    ],
    ['findAll().asSequence().filter', ['95'], 'SpringDataFilterInQuery'],
  ])('reports %s', (_, expected, rule) => {
    const reported = inFixture('Batches.kt')
      .filter((line) => line.endsWith(` ${rule}`))
      .map((line) => line.split(/[: ]/u)[1]);
    expect(reported).toEqual(expected);
  });

  it('reports saves through !!, a local reference, an anonymous function, mapTo, mapValues and findAll().map', () => {
    expect(
      inFixture('Batches.kt')
        .filter((line) => line.endsWith(' SpringDataNoSaveInLoop'))
        .map((line) => line.split(/[: ]/u)[1]),
    ).toEqual(['73', '75', '76', '77', '78', '79', '81']);
  });

  it('reports the save inside a scope function on a repository, not the scope function itself', () => {
    expect(inFixture('Batches.kt').filter((line) => line.startsWith('Batches.kt:81 '))).toEqual([
      'Batches.kt:81 SpringDataNoSaveInLoop',
    ]);
  });
});

function reportedIn(suffix: string): string[] {
  return springFindings(files, {
    finding: findingFactory(),
    manifest: MANIFEST,
    projectFiles: files,
    projectRoot: PROJECT,
    javaRoots: ['src/main/java'],
  })
    .filter(({ path: source }) => source.endsWith(suffix))
    .map(({ location, rule }) => `${String(location.line)} ${rule}`);
}

describe('Spring Data rules on the forms the regression review found', () => {
  it.each([
    [
      'a write left as the last expression of let, run, executeWithoutResult, an if, an elvis or a return@',
      ['57', '58', '59', '60', '61', '62', '63', '64', '66', '67', '68', '69'],
      'SpringDataRowWriteInLoop',
    ],
    [
      'an enum whose converter base takes the enum as its second type argument',
      ['35'],
      'JpaEnumString',
    ],
    [
      'a helper that takes the loop element and the list as Any',
      ['65'],
      'SpringDataSaveInLoopHelper',
    ],
    ['a flush inside the inner loop when only the outer loop clears', ['74'], 'SpringDataNoFlush'],
    [
      'a one-element list passed through filter, map or a cast, or a fresh list given one add',
      ['93', '94', '95', '99', '104'],
      'SpringDataBatchOfOne',
    ],
  ])('reports %s', (_, expected, rule) => {
    expect(
      reportedIn('bad/Rows.kt')
        .filter((line) => line.endsWith(` ${rule}`))
        .map((line) => line.split(' ')[0]),
    ).toEqual(expected);
  });

  it('still reports an executeUpdate that binds the loop variable beside a list parameter', () => {
    expect(reportedIn('bad/Rows.kt').filter((line) => line.startsWith('66 '))).toEqual([
      '66 SpringDataRowWriteInLoop',
    ]);
  });

  it('keeps a mapped value, chunk updates, a plain DAO, converted enums and mapped collections', () => {
    expect(reportedIn('good/Rows.kt')).toEqual([]);
  });
});

describe('Spring Data rules on hand-built facts', () => {
  it('reports IDENTITY ids unless the project database has no sequences', () => {
    const facts = sourceFile({
      classes: [
        klass('Course', {
          annotations: [{ name: 'Entity', arguments: [], type: 'jakarta.persistence.Entity' }],
        }),
      ],
      properties: [
        property('id', 'Course', {
          type: 'Long',
          line: 3,
          annotationEntries: [
            {
              name: 'GeneratedValue',
              type: 'jakarta.persistence.GeneratedValue',
              arguments: [{ name: 'strategy', text: 'GenerationType.IDENTITY' }],
            },
          ],
        }),
      ],
    });
    const sequenceIds = (allowed: boolean) =>
      springFindings([facts], {
        finding: findingFactory(),
        manifest: MANIFEST,
        projectFiles: [facts],
        projectRoot: PROJECT,
        javaRoots: ['src/main/java'],
        sequenceIds: () => allowed,
      })
        .map(({ rule }) => rule)
        .filter((rule) => rule === 'JpaSequenceIds');

    expect(sequenceIds(true)).toEqual(['JpaSequenceIds']);
    expect(sequenceIds(false)).toEqual([]);
  });

  it('skips enums converted by a Java or a positional auto-applied converter', () => {
    const facts = sourceFile({
      package: 'shop.good',
      classes: [
        klass('Tone', { kind: 'enum' }),
        klass('Size', { kind: 'enum' }),
        klass('SizeConverter', {
          annotations: [{ name: 'Converter', arguments: [{ text: 'true' }] }],
          genericSupers: ['AttributeConverter<Size, String>'],
        }),
        klass('Swatch', {
          annotations: [{ name: 'Entity', arguments: [], type: 'jakarta.persistence.Entity' }],
        }),
      ],
      properties: [
        property('tone', 'Swatch', { type: 'Tone' }),
        property('size', 'Swatch', { type: 'Size' }),
      ],
    });

    const enumStrings = (javaRoots: string[]) =>
      lines([facts], { javaRoots }).filter((line) => line.endsWith(' JpaEnumString'));

    expect(enumStrings(['src/main/java'])).toEqual([]);
    expect(enumStrings([])).toEqual(['Sample.kt:1 JpaEnumString']);
  });

  it('treats a Hibernate Session as an entity manager and any Spring Data store repository as a repository', () => {
    const facts = sourceFile({
      imports: [
        { path: 'org.hibernate.Session', all: false },
        { path: 'org.springframework.data.aerospike.repository.AerospikeRepository', all: false },
      ],
      classes: [
        klass('Orders', { kind: 'interface', supers: ['AerospikeRepository'] }),
        klass('Saver', {
          primaryParameters: [parameter('session', 'Session', { property: true })],
        }),
      ],
      functions: [
        fn('findByName', {
          owner: 'Orders',
          hasBody: false,
          parameters: [parameter('name', 'String')],
        }),
        fn('saveAll', { owner: 'Saver', line: 3, parameters: [parameter('items', 'List<Order>')] }),
      ],
      scopes: [
        scope(0, 'class', { name: 'Saver', qualified: 'Saver' }),
        scope(1, 'fun', { parent: 0, name: 'saveAll', line: 3 }),
        scope(2, 'foreach', { parent: 1, range: 'items', params: [{ name: 'item' }] }),
      ],
      invocations: [
        { line: 4, scope: 2, name: 'persist', receiver: 'session', arguments: [{ text: 'item' }] },
      ],
    });

    expect(lines([facts])).toEqual([
      'Sample.kt:1 SpringDataDerivedQuery',
      'Sample.kt:4 SpringDataNoSaveInLoop',
    ]);
  });

  it('applies the Spring Data name pattern only to a repository imported by name', () => {
    const saver = (imports: Loose[]) =>
      sourceFile({
        imports,
        classes: [
          klass('Saver', {
            primaryParameters: [parameter('audits', 'AuditRepository', { property: true })],
          }),
        ],
        functions: [
          fn('saveAll', {
            owner: 'Saver',
            line: 3,
            parameters: [parameter('items', 'List<Order>')],
          }),
        ],
        scopes: [
          scope(0, 'class', { name: 'Saver', qualified: 'Saver' }),
          scope(1, 'fun', { parent: 0, name: 'saveAll', line: 3 }),
          scope(2, 'foreach', { parent: 1, range: 'items', params: [{ name: 'item' }] }),
        ],
        invocations: [
          {
            line: 4,
            scope: 2,
            name: 'save',
            receiver: 'audits',
            arguments: [{ text: 'item' }],
            statement: true,
          },
        ],
      });

    expect(lines([saver([{ path: 'org.springframework.data.domain', all: true }])])).toEqual([]);
    expect(
      lines([saver([{ path: 'org.springframework.data.domain.AuditRepository', all: false }])]),
    ).toEqual(['Sample.kt:4 SpringDataNoSaveInLoop']);
  });

  it('keeps an escaped dollar in a query string as one string', () => {
    const query = (text: string) =>
      sourceFile({
        imports: [{ path: 'org.springframework.data.jpa.repository.Query', all: false }],
        functions: [
          fn('byPrice', {
            owner: 'Orders',
            hasBody: false,
            annotationEntries: [{ name: 'Query', type: 'Query', arguments: [{ text }] }],
          }),
        ],
      });

    expect(lines([query(`"select o from Order o where o.price > \${'$'}1"`)])).toEqual([]);
    expect(lines([query('"select o from Order o where o.label = \'\\$label\'"')])).toEqual([]);
    expect(lines([query('"select o from Order o where o.label = \\\\$label"')])).toEqual([
      'Sample.kt:1 SpringDataQueryTextBlock',
    ]);
    expect(lines([query('"$BASE where o.price > 1"')])).toEqual([
      'Sample.kt:1 SpringDataQueryTextBlock',
    ]);
  });
});

describe('Kotlin Spring Data rules outside a Spring Data project', () => {
  const sessionSaver = () =>
    sourceFile({
      imports: [{ path: 'org.hibernate.Session', all: false }],
      classes: [
        klass('Saver', {
          primaryParameters: [parameter('session', 'Session', { property: true })],
        }),
      ],
      functions: [
        fn('saveAll', { owner: 'Saver', line: 3, parameters: [parameter('items', 'List<Order>')] }),
      ],
      scopes: [
        scope(0, 'class', { name: 'Saver', qualified: 'Saver' }),
        scope(1, 'fun', { parent: 0, name: 'saveAll', line: 3 }),
        scope(2, 'foreach', { parent: 1, range: 'items', params: [{ name: 'item' }] }),
      ],
      invocations: [
        { line: 4, scope: 2, name: 'persist', receiver: 'session', arguments: [{ text: 'item' }] },
        { line: 5, scope: 2, name: 'flush', receiver: 'session', arguments: [] },
      ],
    });

  it('stays silent on entity manager writes and flushes in a loop', () => {
    const manifest = { ...MANIFEST, springClasspath: ['/m2/spring-context-6.1.0.jar'] };

    expect(lines([sessionSaver()], { manifest })).toEqual([]);
  });

  it('keeps reporting them when the classpath is unknown', () => {
    expect(lines([sessionSaver()])).toEqual([
      'Sample.kt:4 SpringDataNoSaveInLoop',
      'Sample.kt:5 SpringDataNoFlush',
    ]);
    expect(lines([sessionSaver()], { manifest: { ...MANIFEST, springClasspath: [] } })).toEqual([
      'Sample.kt:4 SpringDataNoSaveInLoop',
      'Sample.kt:5 SpringDataNoFlush',
    ]);
  });

  it('reports them once a Spring Data jar is on the classpath', () => {
    const manifest = { ...MANIFEST, springClasspath: ['/m2/spring-data-jpa-3.3.0.jar'] };

    expect(lines([sessionSaver()], { manifest })).toEqual([
      'Sample.kt:4 SpringDataNoSaveInLoop',
      'Sample.kt:5 SpringDataNoFlush',
    ]);
  });
});

describe('Kotlin SpringTypedConfiguration on System properties', () => {
  const reader = (annotations: Loose[]) =>
    sourceFile({
      imports: [{ path: 'org.springframework.stereotype.Service', all: false }],
      classes: [klass('Reader', { annotations })],
      functions: [fn('mode', { owner: 'Reader', line: 3 })],
      scopes: [
        scope(0, 'class', { name: 'Reader', qualified: 'Reader' }),
        scope(1, 'fun', { parent: 0, name: 'mode', line: 3 }),
      ],
      invocations: [
        {
          line: 4,
          scope: 1,
          name: 'getProperty',
          receiver: 'System',
          arguments: [{ text: '"app.mode"' }],
        },
      ],
    });

  it('ignores a class that is not a Spring bean', () => {
    expect(lines([reader([])])).toEqual([]);
  });

  it.each([
    ['jakarta.inject.Named', 'Named'],
    ['javax.annotation.ManagedBean', 'ManagedBean'],
    ['org.aspectj.lang.annotation.Aspect', 'Aspect'],
  ])('reports the read in a class annotated with %s', (type, name) => {
    expect(lines([reader([{ name, arguments: [], type }])])).toEqual([
      'Sample.kt:4 SpringTypedConfiguration',
    ]);
  });

  it('reports the read in a stereotype class', () => {
    expect(
      lines([
        reader([
          { name: 'Service', arguments: [], type: 'org.springframework.stereotype.Service' },
        ]),
      ]),
    ).toEqual(['Sample.kt:4 SpringTypedConfiguration']);
  });
});
