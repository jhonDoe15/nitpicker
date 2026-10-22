import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callText, shortCall, withLoadEffectCalls } from './load-effects.mjs';

const SOURCE = `class Db {
  static final Connection DB = DriverManager.getConnection("jdbc:h2:mem:a;MODE=x", USER);
  static {
    try (InputStream in = new URL("https://example.com/(x)").openStream()) {
      new Thread(Db::poll).start();
    }
  }
}
`;
const MESSAGE =
  'Do this work in a method that main calls: this call runs while Db loads (a static field).';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-load-effects-'));
  roots.push(root);
  mkdirSync(path.join(root, 'src/main/java'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/java/Db.java'), SOURCE);
  return root;
}

function finding(overrides = {}) {
  return {
    tool: 'pmd',
    rule: 'ClassLoadEffect',
    path: 'src/main/java/Db.java',
    location: { line: 2, column: 32 },
    message: MESSAGE,
    ...overrides,
  };
}

describe('the call a class-load effect finding names', () => {
  it.each([
    [{ line: 2, column: 32 }, 'DriverManager.getConnection(...)'],
    [{ line: 4, column: 27 }, 'new URL(...).openStream()'],
    [{ line: 5, column: 7 }, 'new Thread(...).start()'],
  ])('reads the expression at %o, with its arguments left out', (location, call) => {
    expect(callText(SOURCE, location)).toBe(call);
  });

  it('collapses arguments and lambdas, joins lines and shortens a long chain', () => {
    expect(shortCall('CoroutineScope(Dispatchers.IO)\n    .launch { poll() }')).toBe(
      'CoroutineScope(...) .launch {...}',
    );
    expect(shortCall(`a.${'b().'.repeat(40)}c()`)).toHaveLength(103);
  });
});

describe('withLoadEffectCalls', () => {
  it('puts the call in place of "this call" and leaves other findings alone', () => {
    const root = project();
    const other = finding({ rule: 'StaticForwardingWrapper' });

    expect(withLoadEffectCalls([finding(), other], { projectRoot: root })).toEqual([
      finding({
        message:
          'Do this work in a method that main calls: `DriverManager.getConnection(...)` runs while Db loads (a static field).',
      }),
      other,
    ]);
  });

  it('keeps the message when the source or the location is missing', () => {
    const root = project();
    const findings = [
      finding({ path: 'src/main/java/Gone.java' }),
      finding({ location: undefined }),
    ];

    expect(withLoadEffectCalls(findings, { projectRoot: root })).toEqual(findings);
    expect(withLoadEffectCalls([finding()], { projectRoot: undefined })).toEqual([finding()]);
  });
});
