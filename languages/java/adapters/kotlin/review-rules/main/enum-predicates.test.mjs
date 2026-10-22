import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { file, klass, routeOf, run, summary } from '../test-support/facts.mjs';
import { ENUM_PREDICATE_RULE } from '../../../review-rules/enum-predicates.mjs';
import { enumMessage, enumPredicateFindings } from './enum-predicates.mjs';

const status = klass('Status', { kind: 'enum', entries: ['NEW', 'PAID', 'SHIPPED', 'CANCELLED'] });
const comparison = (left, right, stability = {}) => ({
  left,
  right,
  leftStable: true,
  rightStable: true,
  ...stability,
});
const chain = (comparisons, overrides = {}) => ({
  kind: 'chain',
  line: 4,
  symbol: 'isSettled',
  negated: false,
  holder: 'return',
  comparisons,
  ...overrides,
});
const membership = (elements, overrides = {}) => ({
  kind: 'membership',
  line: 6,
  symbol: 'isOpen',
  holder: 'return',
  subject: 'status',
  subjectStable: true,
  elements,
  ...overrides,
});

const roots = [];
afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function findingsFor(predicates, extra = {}, options = {}) {
  const files = [
    file({ file: 'src/main/kotlin/demo/Status.kt', classes: [status] }),
    file({ predicates, ...extra }),
  ];
  return run(enumPredicateFindings, files, options);
}

const SETTLED = chain([
  comparison('status', 'Status.PAID'),
  comparison('status', 'Status.SHIPPED'),
]);

describe('exhaustive enum predicate in Kotlin', () => {
  it('reports a subset chain over a project enum with the Java rule id and exception route', () => {
    const findings = findingsFor([SETTLED]);

    expect(summary(findings)).toEqual([`${ENUM_PREDICATE_RULE} isSettled 4`]);
    expect(findings[0].tool).toBe('pmd');
    expect(findings[0].message).toBe(enumMessage('Status'));
    expect(routeOf(findings[0].message)).toBe(
      'add an exception for pmd/ExhaustiveEnumPredicate in nitpicker.config.json.',
    );
  });

  it('reports a membership test in setOf and a negated chain with !=', () => {
    const findings = findingsFor([
      membership(['Status.NEW', 'Status.PAID']),
      chain([comparison('status', 'Status.NEW'), comparison('Status.PAID', 'status')], {
        negated: true,
        line: 9,
        symbol: 'isOther',
      }),
    ]);

    expect(summary(findings)).toEqual([
      `${ENUM_PREDICATE_RULE} isOpen 6`,
      `${ENUM_PREDICATE_RULE} isOther 9`,
    ]);
  });

  it('allows a chain that lists every entry, an enum of fewer than three entries and a repeated entry', () => {
    const all = chain(
      ['NEW', 'PAID', 'SHIPPED', 'CANCELLED'].map((name) => comparison('status', `Status.${name}`)),
    );
    const small = klass('Flag', { kind: 'enum', entries: ['ON', 'OFF'] });
    const files = [
      file({ file: 'src/main/kotlin/demo/Flag.kt', classes: [small] }),
      file({
        predicates: [
          all,
          chain([comparison('flag', 'Flag.ON'), comparison('flag', 'Flag.ON')]),
          chain([comparison('status', 'Status.PAID'), comparison('status', 'Status.PAID')]),
        ],
      }),
      file({ file: 'src/main/kotlin/demo/Status.kt', classes: [status] }),
    ];

    expect(run(enumPredicateFindings, files)).toEqual([]);
  });

  it('allows a predicate used as an if condition, a subject that is a call, and mixed subjects', () => {
    const findings = findingsFor([
      chain(SETTLED.comparisons, { holder: 'other' }),
      chain([
        comparison('order.status()', 'Status.PAID', { leftStable: false }),
        comparison('order.status()', 'Status.SHIPPED', { leftStable: false }),
      ]),
      chain([comparison('status', 'Status.PAID'), comparison('other', 'Status.SHIPPED')]),
      membership(['Status.NEW', 'Status.PAID'], { subjectStable: false }),
    ]);

    expect(findings).toEqual([]);
  });

  it('allows comparisons over an enum of a library, or an enum name declared twice with different entries', () => {
    const other = klass('Status', { kind: 'enum', entries: ['A', 'B', 'C'] });
    const twice = [
      file({ file: 'src/main/kotlin/one/Status.kt', package: 'one', classes: [status] }),
      file({ file: 'src/main/kotlin/two/Status.kt', package: 'two', classes: [other] }),
      file({ file: 'src/main/kotlin/demo/Use.kt', package: 'demo', predicates: [SETTLED] }),
    ];

    expect(
      findingsFor([
        chain([comparison('mode', 'RoundingMode.UP'), comparison('mode', 'RoundingMode.DOWN')]),
      ]),
    ).toEqual([]);
    expect(run(enumPredicateFindings, twice)).toEqual([]);
  });

  it('resolves an entry imported from the enum, with or without a star import', () => {
    const single = file({
      imports: [
        { path: 'demo.Status.PAID', all: false },
        { path: 'demo.Status.SHIPPED', all: false },
      ],
      predicates: [chain([comparison('status', 'PAID'), comparison('status', 'SHIPPED')])],
    });
    const star = file({
      imports: [{ path: 'demo.Status', all: true }],
      predicates: [chain([comparison('status', 'PAID'), comparison('status', 'SHIPPED')])],
    });
    const statusFile = file({ file: 'src/main/kotlin/demo/Status.kt', classes: [status] });

    expect(run(enumPredicateFindings, [statusFile, single])).toHaveLength(1);
    expect(run(enumPredicateFindings, [statusFile, star])).toHaveLength(1);
  });

  it('resolves a backticked entry, qualified or imported', () => {
    const quoted = klass('Phase', { kind: 'enum', entries: ['in', 'is', 'done', 'new phase'] });
    const phaseFile = file({ file: 'src/main/kotlin/demo/Phase.kt', classes: [quoted] });
    const qualified = file({
      predicates: [
        chain([comparison('phase', 'Phase.`in`'), comparison('phase', 'Phase.`new phase`')]),
      ],
    });
    const imported = file({
      imports: [
        { path: 'demo.Phase.in', all: false },
        { path: 'demo.Phase.is', all: false },
      ],
      predicates: [chain([comparison('phase', '`in`'), comparison('phase', '`is`')])],
    });
    const every = file({
      predicates: [
        chain(
          ['`in`', '`is`', 'done', '`new phase`'].map((name) =>
            comparison('phase', `Phase.${name}`),
          ),
        ),
      ],
    });

    expect(run(enumPredicateFindings, [phaseFile, qualified])).toHaveLength(1);
    expect(run(enumPredicateFindings, [phaseFile, imported])).toHaveLength(1);
    expect(run(enumPredicateFindings, [phaseFile, every])).toEqual([]);
  });

  it('knows an enum declared in a Java source file of the project', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-enums-'));
    roots.push(root);
    mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/main/java/demo/Level.java'),
      'package demo;\npublic enum Level { LOW, MID, HIGH }\n',
    );
    const use = file({
      predicates: [chain([comparison('level', 'Level.LOW'), comparison('level', 'Level.MID')])],
    });

    expect(summary(run(enumPredicateFindings, [use], { projectRoot: root }))).toEqual([
      `${ENUM_PREDICATE_RULE} isSettled 4`,
    ]);
  });

  it('ignores test sources', () => {
    const findings = run(enumPredicateFindings, [
      file({ file: 'src/main/kotlin/demo/Status.kt', classes: [status] }),
      file({ file: 'src/test/kotlin/demo/UseTest.kt', test: true, predicates: [SETTLED] }),
    ]);

    expect(findings).toEqual([]);
  });

  it('finds an enum declared in another module through the project facts', () => {
    const sibling = file({ file: 'other/src/main/kotlin/demo/Status.kt', classes: [status] });
    const files = [file({ predicates: [SETTLED] })];

    expect(run(enumPredicateFindings, files, { declaredIn: [...files, sibling] })).toHaveLength(1);
    expect(run(enumPredicateFindings, files)).toEqual([]);
  });
});
