import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  readEffectsFindings,
  readEffectsReport,
  withoutCoveredLines,
} from './effects-findings.mjs';
import { callPath } from './effects-messages.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportWith(violations, counts = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-report-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'effects.json'), JSON.stringify({ ...counts, violations }));
  return root;
}

const loop = {
  rule: 'IoCallInLoop',
  className: 'shop.Import',
  fileName: 'Import.java',
  line: 12,
  method: 'Import.run',
  detail: 'Import.run|Loader.load()>OrderRepository.findById()',
  kind: 'database',
  form: 'loop',
  path: ['Loader.load()', 'OrderRepository.findById()'],
};

function read(violations, options = {}) {
  return readEffectsFindings(reportWith(violations), {
    resolvePath: (className, fileName) =>
      `src/main/${options.directory ?? 'java'}/shop/${fileName}`,
    kotlin: options.kotlin,
  });
}

const JAVA_FILE = 'src/main/java/shop/Import.java';
const KOTLIN_FILE = 'src/main/kotlin/shop/Import.kt';
const PATH = '`Import.run()` calls `Loader.load()`, which calls `OrderRepository.findById()`';
const PER_ITEM = 'once per loop item';
const LOOPS_FINE = 'Paging, polling and retry loops are fine.';
const BATCH_ENDPOINT =
  "Use the service's batch endpoint for all items, or, when it has none, bound the concurrency with";

function exception(rule, file) {
  const entry = `{"rule":"effects/${rule}","paths":["${file}"],"reason":"..."}`;
  return `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;
}

function sentence(...parts) {
  return parts.join(' ');
}

const ASM_ADVICE =
  "class files newer than the engine's ASM release are the usual cause: build with a JDK that ASM reads, or raise the pinned ASM version";

describe('readEffectsFindings', () => {
  it('turns a violation into a finding with the call path, the allowed form and the exception', () => {
    expect(read([loop])).toEqual([
      {
        tool: 'effects',
        rule: 'IoCallInLoop',
        path: JAVA_FILE,
        identity: 'IoCallInLoop:Import.run|Loader.load()>OrderRepository.findById()',
        message: sentence(
          'Fetch or write all items at once (`findAllById`, `saveAll`, `deleteAllById`, `WHERE id IN (...)`,',
          `or a helper that takes the whole list): ${PATH} ${PER_ITEM}, one query each.`,
          LOOPS_FINE,
          exception('IoCallInLoop', JAVA_FILE),
        ),
        classification: 'enforceable',
        location: { line: 12 },
      },
    ]);
  });

  it.each([
    [
      { kind: 'remote' },
      sentence(
        BATCH_ENDPOINT,
        'a bounded executor (`Executors.newFixedThreadPool(n)`, a bounded `ThreadPoolExecutor`) or a `Semaphore`:',
        `${PATH} ${PER_ITEM}, one request each.`,
        LOOPS_FINE,
        exception('IoCallInLoop', JAVA_FILE),
      ),
    ],
    [
      { form: 'concurrent' },
      sentence(
        'Fetch or write the items in one query (`findAllById`, `saveAll`, `WHERE id IN (...)`):',
        `${PATH} for each item, and running them concurrently still sends one query per item.`,
        exception('IoCallInLoop', JAVA_FILE),
      ),
    ],
  ])('words the %j variant', (variant, message) => {
    expect(read([{ ...loop, ...variant }]).map((finding) => finding.message)).toEqual([message]);
  });

  it('names the Kotlin bounded forms and collection builders in Kotlin files', () => {
    const messages = read(
      [
        { ...loop, fileName: 'Import.kt', kind: 'remote' },
        {
          rule: 'AccumulatorCopyInLoop',
          className: 'shop.Import',
          fileName: 'Import.kt',
          line: 20,
          method: 'Import.fold',
          detail: 'Import.fold|acc',
          variable: 'acc',
          form: 'loop',
        },
      ],
      { directory: 'kotlin', kotlin: true },
    ).map((finding) => finding.message);

    expect(messages).toEqual([
      sentence(
        BATCH_ENDPOINT,
        '`Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)`:',
        `${PATH} ${PER_ITEM}, one request each.`,
        LOOPS_FINE,
        exception('IoCallInLoop', KOTLIN_FILE),
      ),
      sentence(
        'Build the result once with `map`, `flatMap`, `associate`, `groupBy`, `buildList`, or one mutable',
        'collection filled in the loop: in `Import.fold()` each loop step copies `acc` into a new collection,',
        'so the work grows with the square of the list.',
        exception('AccumulatorCopyInLoop', KOTLIN_FILE),
      ),
    ]);
  });

  it('names the entity, the relationship, the origin query and the fetch forms for lazy loads', () => {
    const lazy = {
      rule: 'LazyRelationInLoop',
      className: 'shop.Import',
      line: 30,
      method: 'Import.names',
      detail: 'Import.names|Invoice.customer',
      entity: 'Invoice',
      relation: 'customer',
      collection: false,
      origin: 'InvoiceRepository.findAll()',
    };
    const messages = read(
      [
        { ...lazy, fileName: 'Import.java' },
        { ...lazy, fileName: 'Import.kt' },
      ],
      { kotlin: true },
    ).map((finding) => finding.message);
    const text = (paths, file) =>
      sentence(
        'Fetch `Invoice.customer` with the query that loads the list:',
        `add \`@EntityGraph(attributePaths = ${paths})\` to \`InvoiceRepository.findAll()\``,
        'or a `JOIN FETCH` of `customer` to its query, batch the loads with `@BatchSize` on the',
        'relationship or `hibernate.default_batch_fetch_size`, or select a projection that holds the values:',
        '`Import.names()` reads the lazy `customer` of each `Invoice` that `InvoiceRepository.findAll()`',
        'returns, one more query per item.',
        exception('LazyRelationInLoop', file),
      );

    expect(messages).toEqual([
      text('"customer"', JAVA_FILE),
      text('["customer"]', 'src/main/java/shop/Import.kt'),
    ]);
  });

  it('names the held scope, the remote call path and the way out for transactions and locks', () => {
    const held = {
      className: 'shop.Import',
      fileName: 'Import.java',
      line: 40,
      method: 'Import.confirm',
      holder: 'Import.confirm',
      path: ['PriceSource.priceOf()', 'RestClient.get()'],
    };
    const calls =
      '`Import.confirm()` calls `PriceSource.priceOf()`, which calls `RestClient.get()`';
    const messages = read([
      { ...held, rule: 'RemoteCallInTransaction', scope: '@Transactional', detail: 'a' },
      { ...held, rule: 'RemoteCallUnderLock', scope: 'ReentrantLock.lock()', detail: 'b' },
    ]).map((finding) => finding.message);

    expect(messages).toEqual([
      sentence(
        'Make the remote call before the transaction starts or after it commits; when its side effect must',
        'match the transaction, write an outbox row in the transaction and send it from a worker:',
        `${calls} inside the \`@Transactional\` method \`Import.confirm()\`, which also uses the database,`,
        "so a pooled connection stays held for the remote call's latency and the pool runs dry under load.",
        exception('RemoteCallInTransaction', JAVA_FILE),
      ),
      sentence(
        'Make the remote call before taking the lock or after releasing it, and keep only the change of the',
        'shared state inside; copy the value you need out of the lock first:',
        `${calls} while holding \`ReentrantLock.lock()\` in \`Import.confirm()\`,`,
        "so every thread waiting for the lock also waits for the remote call's latency.",
        'A fill-once block stays allowed: the call under an `if` that tests the state the block then sets',
        '(a token refresh, a cached download), so callers wait for one request instead of each sending their',
        'own. When the remote effect must happen exactly once per state change, record it in an outbox row and',
        'send it from a worker.',
        exception('RemoteCallUnderLock', JAVA_FILE),
      ),
    ]);
  });

  it('names the retry scope, the write and its idempotent form', () => {
    const retried = {
      rule: 'RetryWithoutIdempotency',
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.pay',
      holder: 'Import.pay',
    };
    const messages = read([
      {
        ...retried,
        line: 3,
        detail: 'a',
        scope: '@Retryable',
        write: 'payment',
        path: ['Charge.create()'],
      },
      {
        ...retried,
        line: 4,
        detail: 'b',
        scope: 'retry loop',
        write: 'insert',
        path: ['JdbcTemplate.update()'],
      },
      {
        ...retried,
        line: 5,
        detail: 'c',
        scope: 'RetryTemplate.execute()',
        write: 'message',
        path: ['KafkaTemplate.send()'],
      },
    ]).map((finding) => finding.message);
    const tail =
      'and when a call times out after the other side accepted the write, the retry makes it again.';

    expect(messages).toEqual([
      sentence(
        'Pass a stable idempotency key derived from the request (`RequestOptions.builder().setIdempotencyKey(...)`),',
        'or retry only the read: `Import.pay()` calls `Charge.create()` inside the `@Retryable` method `Import.pay()`,',
        tail,
        exception('RetryWithoutIdempotency', JAVA_FILE),
      ),
      sentence(
        'Make the insert an upsert keyed on a stable id (`ON CONFLICT`, `ON DUPLICATE KEY UPDATE`, `MERGE`),',
        'or retry only the read: `Import.pay()` calls `JdbcTemplate.update()` inside a retry loop in `Import.pay()`,',
        tail,
        exception('RetryWithoutIdempotency', JAVA_FILE),
      ),
      sentence(
        'Give the message a deduplication id the broker honours (SQS or SNS FIFO `messageDeduplicationId`),',
        'or retry only the read: `Import.pay()` calls `KafkaTemplate.send()` inside `RetryTemplate.execute()`',
        'in `Import.pay()`,',
        tail,
        exception('RetryWithoutIdempotency', JAVA_FILE),
      ),
    ]);
  });

  it('explains both failure windows of a dual write and the after-commit variant', () => {
    const dual = {
      rule: 'DualWriteWithoutOutbox',
      className: 'shop.Import',
      fileName: 'Import.java',
      method: 'Import.place',
      write: ['OrderRepository.save()'],
      path: ['OrderEvents.placed()', 'KafkaTemplate.send()'],
    };
    const messages = read([
      { ...dual, line: 3, detail: 'a', form: 'inline' },
      { ...dual, line: 4, detail: 'b', form: 'afterCommit' },
    ]).map((finding) => finding.message);
    const outbox = sentence(
      'Write the message to an outbox table in the same transaction and let a relay publish it',
      '(or use change data capture or a database-backed queue):',
      '`Import.place()` writes with `OrderRepository.save()` and publishes',
    );
    const through = '`OrderEvents.placed()`, which calls `KafkaTemplate.send()`';

    expect(messages).toEqual([
      sentence(
        `${outbox} through ${through}, so a rollback after the publish announces a change that never happened,`,
        'and a crash after the commit loses the message.',
        exception('DualWriteWithoutOutbox', JAVA_FILE),
      ),
      sentence(
        `${outbox} after the commit through ${through}, which never announces a rolled-back change,`,
        'but a crash between the commit and the publish loses the message.',
        exception('DualWriteWithoutOutbox', JAVA_FILE),
      ),
    ]);
  });

  it('numbers repeated identities per file and leaves Kotlin files to the kotlin preset', () => {
    const findings = read([loop, { ...loop, line: 14 }, { ...loop, fileName: 'Other.kt' }]);

    expect(findings.map((finding) => finding.identity)).toEqual([
      'IoCallInLoop:Import.run|Loader.load()>OrderRepository.findById()',
      'IoCallInLoop:Import.run|Loader.load()>OrderRepository.findById()#2',
    ]);
  });

  it('rejects an unknown rule and a missing report', () => {
    expect(() => read([{ ...loop, rule: 'Nope' }])).toThrow(/Unknown effects rule Nope/u);
    expect(() =>
      readEffectsFindings(path.join(tmpdir(), 'nitpicker-no-such-report'), {
        resolvePath: () => undefined,
      }),
    ).toThrow(/effects\.json is missing/u);
  });
});

describe('readEffectsReport', () => {
  const resolvePath = (className, fileName) => `src/main/java/shop/${fileName}`;

  it('locates the covered calls and adds a notice for class files the engine could not read', () => {
    const fact = {
      rule: 'IoCallInLoop',
      className: 'shop.Import',
      fileName: 'Import.java',
      line: 9,
      firstLine: 8,
      kind: 'message',
      form: 'loop',
      verdict: 'exempt',
    };
    const root = reportWith([], {
      classes: 3,
      skipped: 2,
      unreadableLibraries: 1,
      covered: [fact],
    });
    const { findings, covered } = readEffectsReport(root, { resolvePath });

    expect(covered).toEqual([{ ...fact, path: JAVA_FILE }]);
    expect(findings).toEqual([
      {
        tool: 'effects',
        rule: 'effects-skipped-classes',
        path: '.',
        identity: 'effects-skipped-classes',
        classification: 'descriptive',
        message: `The effects engine could not read 2 class files of this module and 1 library classes, so its rules did not check that code; ${ASM_ADVICE}.`,
      },
    ]);
  });

  it('fails when the engine could read none of the class files', () => {
    const root = reportWith([], { classes: 0, skipped: 4 });

    expect(() => readEffectsReport(root, { resolvePath })).toThrow(
      new Error(
        `The effects engine could not read any of the 4 class files of the module, so it checked nothing; ${ASM_ADVICE}`,
      ),
    );
  });

  it('asks for MGET or a pipeline when the loop reads Redis', () => {
    const redis = { ...loop, store: 'redis', path: ['ValueOperations.get()'] };
    const [finding] = read([redis]);

    expect(finding.message.split(':')[0]).toBe(
      'Read or write all keys in one round trip with `MGET` (`opsForValue().multiGet(keys)`) or a pipeline (`executePipelined`)',
    );
  });
});

describe('withoutCoveredLines', () => {
  const at = (tool, rule, line, firstLine) => ({
    tool,
    rule,
    path: 'src/A.java',
    location: { line },
    ...(firstLine === undefined ? {} : { firstLine }),
  });
  const fact = (line, verdict) => ({ path: 'src/A.java', line, firstLine: line, verdict });

  it('drops a loop finding when PMD or a Spring Data loop rule reports a line of its call', () => {
    const findings = [
      at('pmd', 'IoCallInLoop', 3),
      at('pmd', 'SpringDataSaveInLoopHelper', 5),
      at('pmd', 'IoCallInLoop', 10),
      at('effects', 'IoCallInLoop', 3),
      at('effects', 'IoCallInLoop', 5),
      at('effects', 'IoCallInLoop', 7),
      at('effects', 'IoCallInLoop', 12, 10),
      at('effects', 'AccumulatorCopyInLoop', 3),
    ];

    expect(withoutCoveredLines(findings).filter(({ tool }) => tool === 'effects')).toEqual([
      at('effects', 'IoCallInLoop', 7),
      at('effects', 'AccumulatorCopyInLoop', 3),
    ]);
  });

  it('drops PMD loop findings on calls the engine exempts, unless an owned call shares the line', () => {
    const findings = [
      at('pmd', 'IoCallInLoop', 3),
      at('pmd', 'IoCallInLoop', 5),
      at('pmd', 'IoCallInLoop', 7),
      at('pmd', 'IoCallInLoop', 9),
      at('effects', 'IoCallInLoop', 9),
    ];
    const covered = [fact(3, 'exempt'), fact(5, 'exempt'), fact(5, 'owned'), fact(9, 'exempt')];

    expect(withoutCoveredLines(findings, covered)).toEqual([
      at('pmd', 'IoCallInLoop', 5),
      at('pmd', 'IoCallInLoop', 7),
      at('pmd', 'IoCallInLoop', 9),
    ]);
  });
});

describe('callPath', () => {
  it('chains the helper calls', () => {
    expect(callPath(['A.a()', 'B.b()', 'C.c()'])).toBe(
      'calls `A.a()`, which calls `B.b()`, which calls `C.c()`',
    );
    expect(callPath(['Repo.find()'])).toBe('calls `Repo.find()`');
  });
});
