import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FAN_OUT_LEAD, FAN_OUT_RULE, fanOutDetail, withFanOutDetails } from './fan-out-details.mjs';

const FILE = 'src/main/java/shop/Prefetch.java';
const RULESET = path.resolve(import.meta.dirname, '../../gradle/pmd-main-ruleset.xml');
const REST = ', with no bound on how many run together.';
const roots = [];

function finding(line, rule = FAN_OUT_RULE) {
  return {
    tool: 'pmd',
    rule,
    path: FILE,
    identity: `${rule}:${String(line)}`,
    message: `${FAN_OUT_LEAD}${REST}`,
    classification: 'enforceable',
    location: { line },
  };
}

function projectWith(text) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fan-out-'));
  roots.push(root);
  mkdirSync(path.dirname(path.join(root, FILE)), { recursive: true });
  writeFileSync(path.join(root, FILE), text);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('fanOutDetail', () => {
  it('names the streamed collection and the task start', () => {
    const text = [
      'class A {',
      '  List<F> f() {',
      '    return this.urls.stream()',
      '        .map(u -> supplyAsync(() -> get(u)))',
      '        .toList();',
      '  }',
      '}',
    ].join('\n');

    expect(fanOutDetail(text, 3)).toBe(
      '`this.urls` starts `CompletableFuture.supplyAsync` for every element at once',
    );
  });

  it('names the iterated collection of an enhanced and an indexed for loop', () => {
    const text = [
      'for (final String url : page.urls()) {',
      '  pool.submit(() -> get(url));',
      '}',
      'for (int i = 0; i < urls.size(); i++) {',
      '  Thread.startVirtualThread(() -> get(urls.get(i)));',
      '}',
    ].join('\n');

    expect([fanOutDetail(text, 1), fanOutDetail(text, 4)]).toEqual([
      '`page.urls()` starts `ExecutorService.submit` for every element at once',
      '`urls` starts `Thread.startVirtualThread` for every element at once',
    ]);
  });

  it('describes the work of a helper it cannot see and stops at the end of the statement', () => {
    const text = 'ids.forEach(id -> fetchLater(id));\nother.submit(() -> run());\n';

    expect(fanOutDetail(text, 1)).toBe(
      '`ids` starts a task that makes a remote or message call for every element at once',
    );
  });

  it('reads call receivers, static streams, ranges and task lists', () => {
    const text = [
      'getUrls().stream().forEach(u -> supplyAsync(() -> get(u)));',
      'Arrays.stream(urls).forEach(u -> new Thread(() -> get(u)).start());',
      'return IntStream.range(0, urls.size()).mapToObj(i -> supplyAsync(() -> get(urls.get(i)))).toList();',
      'return everyone.invokeAll(tasks);',
      'for (String url : getUrls()) { Thread.ofVirtual().start(() -> get(url)); }',
    ].join('\n');

    expect([1, 2, 3, 4, 5].map((line) => fanOutDetail(text, line))).toEqual([
      '`getUrls()` starts `CompletableFuture.supplyAsync` for every element at once',
      '`urls` starts `Thread.start` for every element at once',
      '`urls` starts `CompletableFuture.supplyAsync` for every element at once',
      '`tasks` starts `ExecutorService.invokeAll` for every element at once',
      '`getUrls()` starts `Thread.Builder.start` for every element at once',
    ]);
  });

  it('names the task start that comes first in the source', () => {
    const text =
      'for (String u : urls) { pool.execute(() -> log(u)); supplyAsync(() -> get(u)); }\n';

    expect(fanOutDetail(text, 1)).toBe(
      '`urls` starts `Executor.execute` for every element at once',
    );
  });

  it('gives up when no collection is visible', () => {
    expect(fanOutDetail('futures.add(start());\n', 1)).toBeUndefined();
  });
});

describe('UnboundedFanOut ruleset message', () => {
  it('starts with the lead the details replace', () => {
    const ruleset = readFileSync(RULESET, 'utf8');
    const rule = ruleset.slice(ruleset.indexOf(`<rule name="${FAN_OUT_RULE}"`));

    expect(/message="([^"]*)"/u.exec(rule)?.[1].startsWith(FAN_OUT_LEAD)).toBe(true);
  });
});

describe('withFanOutDetails', () => {
  it('puts the names in front of the explanation and leaves other findings alone', () => {
    const root = projectWith(
      [
        'class A {',
        '  void f() {',
        '    for (String url : urls) {',
        '      pool.submit(() -> get(url));',
      ]
        .concat(['    }', '  }', '}'])
        .join('\n'),
    );
    const other = finding(3, 'ExhaustiveEnumPredicate');

    expect(withFanOutDetails([finding(3), other], { projectRoot: root })).toEqual([
      {
        ...finding(3),
        message: `\`urls\` starts \`ExecutorService.submit\` for every element at once${REST}`,
      },
      other,
    ]);
  });

  it('keeps the generic message without a project root or a readable source', () => {
    const root = projectWith('class A {}\n');

    expect(withFanOutDetails([finding(1)], { projectRoot: undefined })).toEqual([finding(1)]);
    expect(withFanOutDetails([finding(1)], { projectRoot: root })).toEqual([finding(1)]);
  });
});
