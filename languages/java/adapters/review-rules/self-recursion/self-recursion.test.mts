import { describe, expect, it } from 'vitest';
import { PROJECT, useTempProjects } from '../test-support/temp-projects.mts';
import { readSelfRecursionFindings as read } from './self-recursion.mts';

const projectWith = useTempProjects('nitpicker-jvm-recursion-');

function java(body: string) {
  const root = projectWith({
    'src/main/java/shop/Walker.java': `package shop;\nclass Walker {\n${body}\n}\n`,
  });
  return read(root, { projects: [PROJECT], kotlin: false });
}

function kotlin(body: string) {
  const root = projectWith({
    'src/main/kotlin/shop/Walker.kt': `package shop\nclass Walker {\n${body}\n}\n`,
  });
  return read(root, { projects: [PROJECT], kotlin: true });
}

const TOTAL = `  int total(Node node) {
    if (node == null) { return 0; }
    return node.value + total(node.next);
  }`;

describe('SelfRecursion in Java', () => {
  it('reports a method that calls itself, on the call, naming the loop forms', () => {
    const [finding, ...rest] = java(TOTAL);

    expect(rest).toEqual([]);
    expect(finding?.location.line).toBe(5);
    expect(finding?.message).toBe(
      '`total` calls itself. Retry or poll: loop over attempt numbers. Tree walk (directories, AST, JSON): loop over a worklist, a `Deque` or `List` that each step adds the node\'s children to. Flat data: a stream with `map` or `flatMap`, or a loop. An exception fits only when the recursion is bounded and deliberate. If this is intended, add {"rule":"pmd/SelfRecursion","paths":["src/main/java/shop/Walker.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports a cycle between two methods once, on the method declared first', () => {
    const findings = java(`  boolean even(int n) { return n == 0 || odd(n - 1); }
  boolean odd(int n) { return n != 0 && even(n - 1); }`);

    expect(findings.map(({ location }) => location.line)).toEqual([3]);
    expect(findings[0]?.message.startsWith('`even` and `odd` call each other.')).toBe(true);
  });

  it('reports this.name(...)', () => {
    expect(java('  int f(int n) { if (n > 0) { return this.f(n - 1); } return 0; }')).toHaveLength(
      1,
    );
  });

  it.each([
    [
      'a worklist loop',
      '  int total(Node root) {\n    int sum = 0;\n    for (Node n : pending(root)) { sum += n.value; }\n    return sum;\n  }',
    ],
    [
      'an overload that delegates',
      '  int size(Node n) { return size(n, 0); }\n  int size(Node n, int depth) { return depth; }',
    ],
    ['a call on another receiver', '  void walk(Node n) { if (n != null) { n.child.walk(); } }'],
    ['a scheduled callback', '  void poll() { executor.schedule(() -> poll(), 1, SECONDS); }'],
    ['the unconditional case Error Prone reports', '  int f(int n) { return f(n + 1); }'],
    ['a call without a matching method', '  void run() { helper(1); }'],
  ])('allows %s', (_name, body) => {
    expect(java(body)).toEqual([]);
  });
});

describe('SelfRecursion in Kotlin', () => {
  it('reports a function that calls itself and mutual recursion', () => {
    const own = kotlin(
      '  fun total(node: Node?): Int {\n    if (node == null) return 0\n    return node.value + total(node.next)\n  }',
    );
    const mutual = kotlin(
      '  fun even(n: Int): Boolean = n == 0 || odd(n - 1)\n  fun odd(n: Int): Boolean = n != 0 && even(n - 1)',
    );

    expect(own.map(({ location }) => location.line)).toEqual([5]);
    expect(own[0]?.message.includes('ArrayDeque')).toBe(true);
    expect(mutual.map(({ location }) => location.line)).toEqual([3]);
  });

  it('reports a walk through the children of the same class', () => {
    const walk = kotlin(
      '  val children: List<Walker> = listOf()\n  fun walk() {\n    children.forEach { it.walk() }\n  }',
    );

    expect(walk.map(({ location }) => location.line)).toEqual([5]);
  });

  it('allows a worklist loop and a delegating overload', () => {
    expect(
      kotlin(
        '  fun total(root: Node): Int {\n    val pending = ArrayDeque(listOf(root))\n    var sum = 0\n    while (pending.isNotEmpty()) { sum += pending.removeFirst().value }\n    return sum\n  }\n  fun size(n: Node) = size(n, 0)\n  fun size(n: Node, depth: Int) = depth',
      ),
    ).toEqual([]);
  });
});
