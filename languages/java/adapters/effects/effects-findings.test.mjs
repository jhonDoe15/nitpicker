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
    resolvePath: (_className, fileName) =>
      `src/main/${options.directory ?? 'java'}/shop/${fileName}`,
    kotlin: options.kotlin,
  });
}

const JAVA_FILE = 'src/main/java/shop/Import.java';
const KOTLIN_FILE = 'src/main/kotlin/shop/Import.kt';
const PATH = '`Import.run()` calls `Loader.load()`, which calls `OrderRepository.findById()`';
const PER_ITEM = 'once per loop item';
const LOOPS_FINE =
  'Paging, polling and retry loops are fine; a loop the rule misjudges (a cursor kept in an object or array, a page count read first) goes in `exceptions`.';
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
    const messages = read([{ ...loop, fileName: 'Import.kt', kind: 'remote' }], {
      directory: 'kotlin',
      kotlin: true,
    }).map((finding) => finding.message);

    expect(messages).toEqual([
      sentence(
        BATCH_ENDPOINT,
        '`Semaphore.withPermit`, `flatMapMerge(concurrency = n)`, `limitedParallelism(n)` or `chunked(n)`:',
        `${PATH} ${PER_ITEM}, one request each.`,
        LOOPS_FINE,
        exception('IoCallInLoop', KOTLIN_FILE),
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
  const resolvePath = (_className, fileName) => `src/main/java/shop/${fileName}`;

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

  it('names what the engine skipped, what it could not resolve and why it did not run', () => {
    const degraded = { oversizedMethods: 2, timeBudgetExceeded: true };
    const unresolved = { supertypes: 6, total: 20 };
    const notices = (extra) =>
      readEffectsReport(reportWith([], { classes: 3, ...extra }), { resolvePath }).findings.map(
        ({ rule, message, classification }) => ({ rule, message, classification }),
      );

    expect(notices({ degraded, unresolved })).toEqual([
      {
        rule: 'effects-degraded',
        classification: 'descriptive',
        message:
          'The effects engine skipped part of this module (2 methods too large to analyze and the time budget ran out), so its rules did not check that code; split the large methods, or set the effects option timeBudgetSeconds higher.',
      },
      {
        rule: 'effects-classpath-incomplete',
        classification: 'descriptive',
        message:
          "The effects engine could not find 6 of the 20 parent types of this module's classes on its classpath, so it may miss clients and entities behind them; make the module's compile classpath complete (run the build that resolves its dependencies).",
      },
    ]);
    expect(notices({ degraded: { oversizedMethods: 0, timeBudgetExceeded: false } })).toEqual([]);
    expect(notices({ unresolved: { supertypes: 2, total: 5 } })).toEqual([]);
    expect(notices({ unresolved: { supertypes: 3, total: 400 } })).toEqual([]);
    expect(notices({ unavailable: 'The effects engine needs JDK 17 or newer' })).toEqual([
      {
        rule: 'effects-unavailable',
        classification: 'descriptive',
        message: 'The effects engine needs JDK 17 or newer',
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
    ];

    expect(withoutCoveredLines(findings).filter(({ tool }) => tool === 'effects')).toEqual([
      at('effects', 'IoCallInLoop', 7),
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
