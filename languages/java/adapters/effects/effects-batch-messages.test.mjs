import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readEffectsFindings } from './effects-findings.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function read(violations) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-batch-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'effects.json'), JSON.stringify({ violations }));
  return readEffectsFindings(root, {
    resolvePath: (_className, fileName) => `src/main/java/shop/${fileName}`,
  });
}

const JAVA_FILE = 'src/main/java/shop/Import.java';

function exception(rule, file) {
  const entry = `{"rule":"effects/${rule}","paths":["${file}"],"reason":"..."}`;
  return `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;
}

function sentence(...parts) {
  return parts.join(' ');
}

describe('the messages of the per-item rules for GraphQL, reactive pipelines and rows', () => {
  it('names the batched lookup of a reactive pipeline', () => {
    const lookup = {
      rule: 'ReactiveLookupPerElement',
      className: 'shop.Import',
      fileName: 'Import.java',
      line: 3,
      method: 'Import.posts',
      detail: 'a',
      kind: 'remote',
      path: ['UserService.owner()', 'RestClient.get()'],
    };

    expect(read([{ ...lookup, limited: true }])[0].message).toContain(
      'The concurrency argument bounds how many run at once, but each element still sends its own query.',
    );
    expect(read([lookup]).map((finding) => finding.message)).toEqual([
      sentence(
        'Fetch all the elements with one call (`findAllById`, `where id in (:ids)`, a batch endpoint), then join the',
        'results in memory: `Import.posts()` calls `UserService.owner()`, which calls `RestClient.get()`',
        'once per element of an in-memory collection inside a reactive pipeline, so N elements send N requests.',
        exception('ReactiveLookupPerElement', JAVA_FILE),
      ),
    ]);
  });

  it('names the update or delete statement for rows changed in memory and what it skips', () => {
    const rows = {
      rule: 'RowsChangedInMemory',
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.expire',
      origin: 'OrderRepository.findByStatus()',
      entity: 'Order',
    };
    const skipped =
      'An entity with `@Version`, `@PreUpdate`/`@PreRemove`, `@EntityListeners`, auditing, domain events or cascades is not reported, because a bulk statement skips what these run.';

    expect(
      read([
        { ...rows, line: 3, detail: 'a', form: 'update' },
        { ...rows, line: 4, detail: 'b', form: 'delete' },
      ]).map((finding) => finding.message),
    ).toEqual([
      sentence(
        'Change the rows with one statement (`@Modifying @Query("update Order e set e.status = :to where ...")`)',
        'instead of loading them: `Import.expire()` loads `Order` rows with `OrderRepository.findByStatus()` only to set the',
        `same value on each and write them back. ${skipped}`,
        exception('RowsChangedInMemory', JAVA_FILE),
      ),
      sentence(
        'Delete the rows with one statement (`deleteAllInBatch`, or a `@Modifying` delete query with the same where clause)',
        'instead of loading them first: `Import.expire()` loads `Order` rows with `OrderRepository.findByStatus()` only to',
        `delete them. ${skipped}`,
        exception('RowsChangedInMemory', JAVA_FILE),
      ),
    ]);
  });

  it('names the projection and the exists query for entities loaded for a column or a test', () => {
    const load = {
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.emails',
      origin: 'UserRepository.findByTeamId()',
    };

    expect(
      read([
        {
          ...load,
          rule: 'EntityLoadedForOneColumn',
          line: 3,
          detail: 'a',
          entity: 'User',
          property: 'getEmail',
        },
        { ...load, rule: 'EntityLoadedForExistence', line: 4, detail: 'b', form: 'count' },
        { ...load, rule: 'EntityLoadedForExistence', line: 5, detail: 'c', form: 'loaded' },
      ]).map((finding) => finding.message),
    ).toEqual([
      sentence(
        'Select only the column with a projection (`@Query("select e.email from User e where ...")`, an interface or',
        'record projection): `Import.emails()` loads whole `User` entities with `UserRepository.findByTeamId()`',
        'only to read `getEmail()` from each, with their eager relations.',
        exception('EntityLoadedForOneColumn', JAVA_FILE),
      ),
      sentence(
        'Ask the database with `existsBy...` (or an `exists` query) instead, which stops at the first row:',
        '`Import.emails()` counts the matching rows with `UserRepository.findByTeamId()` only to compare the count with zero.',
        exception('EntityLoadedForExistence', JAVA_FILE),
      ),
      sentence(
        'Ask the database with `existsBy...` (or an `exists` query) instead, which stops at the first row:',
        '`Import.emails()` loads the whole row with `UserRepository.findByTeamId()` only to test whether it is there.',
        exception('EntityLoadedForExistence', JAVA_FILE),
      ),
    ]);
  });

  it('names the batch form of a GraphQL field that queries once per parent', () => {
    const field = {
      rule: 'GraphqlFieldPerParent',
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.customer',
      parent: 'Order',
      path: ['OrderRepository.findById()'],
    };
    const messages = read([
      { ...field, line: 3, detail: 'a', framework: 'spring', kind: 'database' },
      { ...field, line: 4, detail: 'b', framework: 'dgs', kind: 'remote' },
    ]).map((finding) => finding.message);

    expect(messages).toEqual([
      sentence(
        'Batch this field with `@BatchMapping` (one call for all parents) or a registered `DataLoader`,',
        'or read the value from the parent object: `Import.customer()` calls `OrderRepository.findById()`',
        'once per parent object, so a list of N parents sends N queries, and nothing in the code looks like a loop.',
        exception('GraphqlFieldPerParent', JAVA_FILE),
      ),
      sentence(
        'Batch this field with a `@DgsDataLoader` (one call for all parents) read through `DataLoader.load`,',
        'or read the value from the parent object: `Import.customer()` calls `OrderRepository.findById()`',
        'once per parent object, so a list of N parents sends N requests, and nothing in the code looks like a loop.',
        exception('GraphqlFieldPerParent', JAVA_FILE),
      ),
    ]);
  });

  it('names the stale object and the re-read inside the retried scope', () => {
    const retry = {
      rule: 'RetryWithStaleObject',
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.save',
      write: 'OrderRepository.save()',
      object: 'order',
    };
    const messages = read([
      { ...retry, line: 3, detail: 'a', scope: 'retry loop' },
      { ...retry, line: 4, detail: 'b', scope: '@Retryable' },
    ]).map((finding) => finding.message);

    expect(messages).toEqual([
      sentence(
        'Re-read the row by id and re-apply the change inside the retried scope (`Mono.defer { findById(id).map(change).flatMap(save) }`,',
        'a loop that loads the row on each attempt, or a `@Retryable` method that takes the id): `Import.save()` retries after an',
        'optimistic-lock conflict (retry loop) but sends an object that was read or built outside the retry, then calls',
        '`OrderRepository.save()` with `order`, which keeps the old version, so every attempt fails the same way.',
        exception('RetryWithStaleObject', JAVA_FILE),
      ),
      sentence(
        'Re-read the row by id and re-apply the change inside the retried scope (`Mono.defer { findById(id).map(change).flatMap(save) }`,',
        'a loop that loads the row on each attempt, or a `@Retryable` method that takes the id): `Import.save()` is retried by',
        '`@Retryable` after an optimistic-lock conflict but takes the object to save as a parameter, then calls',
        '`OrderRepository.save()` with `order`, which keeps the old version, so every attempt fails the same way.',
        exception('RetryWithStaleObject', JAVA_FILE),
      ),
    ]);
  });
});
