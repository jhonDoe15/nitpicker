import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { parameterMutations } from './parameter-mutation.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return parameterMutations(scanned).map((reported) => [
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

function inFunction(parameter, ...lines) {
  return `fun run(${parameter}) {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
}

describe('parameterMutations', () => {
  it.each([
    ['add', 'items: MutableList<String>', 'items.add("x")'],
    ['removeIf', 'items: MutableList<String>', 'items.removeIf { it.isEmpty() }'],
    ['put', 'table: MutableMap<String, Int>', 'table.put("a", 1)'],
    ['an index write', 'table: MutableMap<String, Int>', 'table["a"] = 1'],
    ['plusAssign', 'items: MutableList<String>', 'items += "x"'],
    ['sort', 'items: MutableList<String>', 'items.sort()'],
    ['an array element write', 'counts: IntArray', 'counts[0] = 1'],
    ['an array element increment', 'counts: IntArray', 'counts[1]++'],
    ['an array sort', 'names: Array<String>', 'names.sort()'],
    ['a safe call', 'items: MutableList<String>', 'items?.add("x")'],
    ['Collections.shuffle', 'items: MutableList<String>', 'Collections.shuffle(items)'],
    ['getOrPut', 'table: MutableMap<String, Int>', 'table.getOrPut("a") { 1 }'],
    [
      'a not-null asserted element',
      'table: MutableMap<String, MutableList<Int>>',
      'table["a"]!!.add(1)',
    ],
    ['a safe element', 'table: MutableMap<String, MutableList<Int>>', 'table["a"]?.add(1)'],
    ['an alias', 'items: MutableList<String>', 'val alias = items', 'alias.add("x")'],
    ['an alias in a property', 'items: MutableList<String>', 'kept = items', 'this.kept.add("x")'],
    [
      'a change before a later shadowing local',
      'items: MutableList<String>',
      'items.add("x")',
      'val items = items.toMutableList()',
    ],
    [
      'a change outside a lambda that names the parameter',
      'items: MutableList<String>',
      'other.forEach { items -> println(items) }',
      'items.add("x")',
    ],
  ])('flags %s', (_name, parameter, line, ...rest) => {
    const lines = [line, ...rest];
    expect(found(inFunction(parameter, ...lines))).toHaveLength(1);
  });

  it('flags a multi-line expression body', () => {
    expect(
      found('fun push(items: MutableList<String>) =\n    run {\n        items.add("x")\n    }\n'),
    ).toEqual([[3, 'push(items)']]);
  });

  it('flags an expression body', () => {
    expect(found('fun push(items: MutableList<String>) = items.add("x")\n')).toEqual([
      [1, 'push(items)'],
    ]);
  });

  it.each([
    ['a read', 'items: MutableList<String>', 'println(items.size)'],
    ['a copy', 'items: MutableList<String>', 'val copy = items.toMutableList()', 'copy.add("x")'],
    [
      'a shadowing local',
      'items: MutableList<String>',
      'val items = items.toMutableList()',
      'items.add("x")',
    ],
    ['a read-only List', 'items: List<String>', 'println(items.sorted())'],
    ['sortedBy', 'items: MutableList<String>', 'println(items.sortedBy { it })'],
    ['an element read', 'counts: IntArray', 'println(counts[0] == 1)'],
    ['another receiver', 'items: MutableList<String>', 'other.add("x")'],
    ['a mutable field of the same name', 'items: MutableList<String>', 'this.items.add("x")'],
    [
      'a change inside a lambda that names the parameter',
      'items: MutableList<String>',
      'other.forEach { items -> items.add("x") }',
    ],
    ['a channel', 'queue: Channel<String>', 'queue.trySend("x")'],
    ['a concurrent map', 'table: ConcurrentHashMap<String, Int>', 'table.put("a", 1)'],
    ['a blocking queue', 'queue: BlockingQueue<String>', 'queue.offer("x")'],
    ['a shared flow', 'flow: MutableSharedFlow<String>', 'flow.tryEmit("x")'],
  ])('passes %s', (_name, parameter, ...lines) => {
    expect(found(inFunction(parameter, ...lines))).toEqual([]);
  });

  it.each([
    [
      'a private function',
      'class A {\n    private fun fill(out: MutableList<String>) {\n        out.add("x")\n    }\n}\n',
    ],
    [
      'a private function on its own line',
      'private\nfun fill(out: MutableList<String>) {\n    out.add("x")\n}\n',
    ],
    [
      'a local function',
      'fun run() {\n    fun fill(out: MutableList<String>) {\n        out.add("x")\n    }\n}\n',
    ],
  ])('passes %s', (_name, source) => {
    expect(found(source)).toEqual([]);
  });

  it('passes an override', () => {
    expect(
      found(
        'class A : B {\n    override fun fill(out: MutableList<String>) {\n        out.add("x")\n    }\n}\n',
      ),
    ).toEqual([]);
  });

  it('reports each mutated parameter once', () => {
    expect(
      found(
        inFunction(
          'a: MutableList<String>, b: MutableList<String>',
          'a.add("x")',
          'a.add("y")',
          'b.clear()',
        ),
      ),
    ).toEqual([
      [2, 'run(a)'],
      [4, 'run(b)'],
    ]);
  });
});
