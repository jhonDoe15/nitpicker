import { describe, expect, it } from 'vitest';
import { placeholderCode } from './placeholder-code.mts';

const FILE = 'src/main/java/org/acme/Rates.java';
const inClass = (...body: readonly string[]) => ['class Rates {', ...body, '}'].join('\n');
const subjects = (source: string, file = FILE) =>
  placeholderCode(source, file).map(({ subject }) => subject);

describe('placeholderCode', () => {
  it('reports a fixed return, a sleep, a copy and an empty method under a stand-in comment', () => {
    const source = inClass(
      '  double rate(String from) {',
      '    // In a real implementation, this would call the rates API',
      '    return 1.1;',
      '  }',
      '  void send(Message message) throws IOException {',
      '    // Placeholder implementation',
      '  }',
      '  List<User> users() {',
      '    /* Mock data for now */',
      '    return Collections.emptyList();',
      '  }',
      '  void pay(Money amount) throws InterruptedException {',
      '    Thread.sleep(500); // simulate network delay',
      '    // In a real scenario the amount',
      '    // is converted first',
      '    Money converted = amount;',
      '    // Replace with the real ledger',
      '    TimeUnit.SECONDS.sleep(1);',
      '  }',
    );
    expect(subjects(source)).toEqual([
      'return 1.1;',
      '}',
      'return Collections.emptyList();',
      'Thread.sleep(500); // simulate network delay',
      'Money converted = amount;',
      'TimeUnit.SECONDS.sleep(1);',
    ]);
  });

  it('gives the offset of the statement', () => {
    const source = inClass(
      '  int size() {',
      '    // placeholder implementation',
      '    return 0;',
      '  }',
    );
    const [found] = placeholderCode(source, FILE);
    const offset = found?.offset ?? 0;
    expect(source.slice(offset, offset + 'return 0;'.length)).toBe('return 0;');
  });

  it('reports a statement once when two comments name it', () => {
    const source = inClass(
      '  void pay() throws InterruptedException {',
      '    // Simulate the API call',
      '    Thread.sleep(500); // simulate network delay',
      '  }',
    );
    expect(subjects(source)).toHaveLength(1);
  });

  it('leaves a comment alone when the code under it does real work', () => {
    const source = inClass(
      '  double rate(String from) {',
      '    // In a real implementation, this would call the rates API',
      '    return client.rate(from);',
      '  }',
      '  void pay(Money amount) {',
      '    // In a real application, might throw a specific exception',
      '    ledger.add(amount);',
      '    try {',
      '      ledger.flush();',
      '    } catch (IOException e) {',
      '      log.warn("flush failed", e);',
      '      // In a real application this would be retried',
      '    }',
      '    if (amount.isZero()) {',
      '      // placeholder implementation',
      '    }',
      '    // Replace with the real ledger',
      '    this.ledger = null;',
      '    // simulate network delay',
      '    this.count = count + 1;',
      '  }',
    );
    expect(subjects(source)).toEqual([]);
  });

  it('leaves stand-in code alone without the words of a stand-in', () => {
    const source = inClass(
      '  double rate(String from) {',
      '    // The fixed rate for now',
      '    return 1.1;',
      '  }',
      '  void onEvent() {',
      '    // In a real browser the event fires twice',
      '  }',
      '  String text() {',
      '    return "in a real app this is a placeholder implementation";',
      '  }',
    );
    expect(subjects(source)).toEqual([]);
  });

  it('skips test, example, fixture and documentation paths', () => {
    const source = inClass(
      '  int size() {',
      '    // placeholder implementation',
      '    return 0;',
      '  }',
    );
    expect(subjects(source, 'src/test/java/org/acme/RatesTest.java')).toEqual([]);
    expect(subjects(source, 'examples/src/main/java/org/acme/Rates.java')).toEqual([]);
    expect(subjects(source, 'src/main/java/org/acme/mock/Rates.java')).toEqual([]);
    expect(subjects(source, 'src/main/java/org/acme/contest/Latest.java')).toHaveLength(1);
  });
});
