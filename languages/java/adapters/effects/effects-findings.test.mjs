import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readEffectsFindings, withoutCoveredLines } from './effects-findings.mjs';
import { callPath } from './effects-messages.mjs';

const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function reportWith(violations) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-effects-report-'));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'effects.json'), JSON.stringify({ violations }));
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

describe('withoutCoveredLines', () => {
  const at = (tool, rule, line) => ({ tool, rule, path: 'src/A.java', location: { line } });

  it('drops a loop finding on a line PMD or a Spring Data loop rule reports', () => {
    const findings = [
      at('pmd', 'IoCallInLoop', 3),
      at('pmd', 'SpringDataSaveInLoopHelper', 5),
      at('effects', 'IoCallInLoop', 3),
      at('effects', 'IoCallInLoop', 5),
      at('effects', 'IoCallInLoop', 7),
      at('effects', 'AccumulatorCopyInLoop', 3),
    ];

    expect(withoutCoveredLines(findings).filter(({ tool }) => tool === 'effects')).toEqual([
      at('effects', 'IoCallInLoop', 7),
      at('effects', 'AccumulatorCopyInLoop', 3),
    ]);
  });

  it('keeps the loop finding when an exception lifts the covering rule there', () => {
    const findings = [at('pmd', 'SpringDataNoSaveInLoop', 3), at('effects', 'IoCallInLoop', 3)];
    const exceptions = [{ rule: 'pmd/SpringDataNoSaveInLoop', paths: ['shop/src/A.java'] }];

    expect(withoutCoveredLines(findings, { exceptions, modulePath: 'shop' })).toHaveLength(2);
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
