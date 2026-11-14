import { describe, expect, it } from 'vitest';
import { commentedOutCode } from './commented-out-code.mjs';

const subjects = (source) => commentedOutCode(source).map(({ subject }) => subject);

describe('commentedOutCode', () => {
  it.each([
    ['// int total = price * quantity;', 'int total = price * quantity;'],
    [
      '// final List<String> names = new ArrayList<>();',
      'final List<String> names = new ArrayList<>();',
    ],
    ['// total += price;', 'total += price;'],
    ['// this.name = name;', 'this.name = name;'],
    ['// service.send(order, true);', 'service.send(order, true);'],
    ['// log.info("sent {}", id);', 'log.info("sent {}", id);'],
    ['// return null;', 'return null;'],
    ['// throw new IllegalStateException("no");', 'throw new IllegalStateException("no");'],
    ['// if (order == null) {', 'if (order == null) {'],
    ['// } else {', '} else {'],
    ['// } catch (IOException e) {', '} catch (IOException e) {'],
    ['// for (Item item : items) {', 'for (Item item : items) {'],
    ['// public void send(Order order) {', 'public void send(Order order) {'],
    ['// private static final int LIMIT = 5;', 'private static final int LIMIT = 5;'],
    ['// import java.util.List;', 'import java.util.List;'],
    ['/* items.clear();\n   total = 0; */', 'items.clear();'],
    ['/*\n * orders.remove(id);\n */', 'orders.remove(id);'],
    ['// Why this works:\n// cache.evict(key);', 'cache.evict(key);'],
    ['// System.out.println(order);', 'System.out.println(order);'],
    ['// Thread.sleep(100);', 'Thread.sleep(100);'],
    ['// Objects.requireNonNull(order);', 'Objects.requireNonNull(order);'],
    ['// new Thread(task).start();', 'new Thread(task).start();'],
    ['// int count;', 'int count;'],
    ['// private final Foo foo;', 'private final Foo foo;'],
    ['// @Autowired private Foo foo;', '@Autowired private Foo foo;'],
    ['// count++;', 'count++;'],
    ['// public void run() {', 'public void run() {'],
    ['// items.clear(); // later', 'items.clear(); // later'],
  ])('reports %j', (source, subject) => {
    expect(subjects(source)).toEqual([subject]);
  });

  it.each([
    '// return value is cached;',
    '// return to the caller;',
    '// Set timeout = 5 seconds;',
    '// Compute the total price for the order.',
    '// the total is price times quantity; we round it up',
    '// see https://example.com/docs',
    '// TODO(#12): remove the retry',
    '// @param order the order to send',
    '// noinspection unchecked',
    '// language=SQL',
    '// total',
    '// Returns the name; never null.',
    '// First, call send(); then wait for the reply.',
    '// }',
    '// ----------------',
    '/** items.clear(); */',
    '/**\n * Usage:\n * orders.remove(id);\n */',
    '// Example:\n// orders.remove(id);',
    '// e.g.\n// orders.remove(id);',
    '// ```\n// orders.remove(id);\n// ```',
    'String url = "// not.a.comment(1);";',
    "char slash = '/'; int total = 0;",
  ])('leaves %j alone', (source) => {
    expect(subjects(source)).toEqual([]);
  });

  it('reports a group of line comments once, at its first code line', () => {
    const source = '// Old way:\n// int a = 1;\n// int b = 2;\nint c = 3;\n';

    expect(commentedOutCode(source)).toEqual([{ offset: 12, subject: 'int a = 1;' }]);
  });

  it('reports separate groups separately', () => {
    const source = '// a.run();\nint x;\n// b.run();\n';

    expect(subjects(source)).toEqual(['a.run();', 'b.run();']);
  });

  it('places a block comment finding on the line of the code', () => {
    const source = '/*\n * old\n * orders.remove(id);\n */\n';

    expect(source.slice(0, commentedOutCode(source)[0].offset).split('\n')).toHaveLength(3);
  });

  it('does not read comment markers inside strings or text blocks', () => {
    const source = 'String a = "// b.run();";\nString c = """\n  // d.run();\n  """;\n';

    expect(subjects(source)).toEqual([]);
  });
});
