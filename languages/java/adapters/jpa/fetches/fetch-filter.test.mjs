import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { COLLECTION_FETCH_RULE, withCrossedFetches } from './fetch-filter.mjs';
import { SOURCES } from './test-support/fetch-sources.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-collection-fetch-'));
for (const [file, text] of Object.entries(SOURCES)) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function candidate(file, line, rule = COLLECTION_FETCH_RULE) {
  return { tool: 'pmd', rule, path: `src/shop/${file}`, location: { line } };
}

function kept(findings) {
  return withCrossedFetches(findings, { projectRoot: root, sourceRoots: ['src'] }).map(
    ({ path: file, location }) => `${path.basename(file)}:${String(location.line)}`,
  );
}

describe('withCrossedFetches', () => {
  it.each([
    ['two collections in a @Query', 'OrderRepository.java', 9],
    ['two collections under one fetched collection', 'OrderRepository.java', 20],
    ['a collection next to an inherited element collection', 'OrderRepository.java', 26],
    ['two collections in an @EntityGraph of the repository entity', 'OrderRepository.java', 29],
    ['two collections in a @NamedEntityGraph', 'Order.java', 8],
    ['a @NamedQuery that names the entity by @Entity(name)', 'Order.java', 11],
    ['a concatenated createQuery string', 'Queries.java', 16],
    ['two criteria fetches on one root', 'Queries.java', 25],
    ['two fetches in a Specification lambda', 'Queries.java', 42],
    ['the second of two queries on one line', 'Edges.java', 29],
    ['collections inherited past a bounded type parameter', 'Edges.java', 33],
  ])('keeps %s', (_name, file, line) => {
    expect(kept([candidate(file, line)])).toEqual([`${file}:${String(line)}`]);
  });

  it.each([
    ['a collection chain with a to-one fetch in a text block', 'OrderRepository.java', 12],
    ['a collection and a to-one fetch', 'OrderRepository.java', 23],
    ['an @EntityGraph of a collection and a to-one relation', 'OrderRepository.java', 32],
    ['a @NamedEntityGraph whose subgraph nests under its only collection', 'Order.java', 9],
    ['a criteria fetch chain along one collection', 'Queries.java', 34],
    ['a to-one relation whose entity is named Collection', 'Edges.java', 10],
    ['two criteria queries in one method, one collection each', 'Edges.java', 19],
    ['a method of a nested class next to another method', 'Edges.java', 23],
  ])('drops %s', (_name, file, line) => {
    expect(kept([candidate(file, line)])).toEqual([]);
  });

  it('drops an entity graph whose attribute name is not a field name', () => {
    expect(
      withCrossedFetches([{ ...candidate('Odd.java', 7) }], {
        projectRoot: root,
        sourceRoots: ['src'],
      }),
    ).toEqual([]);
  });

  it('leaves other rules, Kotlin files and missing files alone', () => {
    const others = [
      candidate('OrderRepository.java', 23, 'JpaLazyFetching'),
      { ...candidate('Orders.kt', 3), path: 'src/shop/Orders.kt' },
      candidate('Missing.java', 1),
    ];

    expect(kept(others)).toEqual(['OrderRepository.java:23', 'Orders.kt:3', 'Missing.java:1']);
  });
});
