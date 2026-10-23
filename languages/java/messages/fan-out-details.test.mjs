import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FAN_OUT_LEAD, FAN_OUT_RULE, fanOutDetail, withFanOutDetails } from './fan-out-details.mjs';

const FILE = 'src/main/java/shop/Prefetch.java';
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

  it('gives up when no collection is visible', () => {
    expect(fanOutDetail('futures.add(start());\n', 1)).toBeUndefined();
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
