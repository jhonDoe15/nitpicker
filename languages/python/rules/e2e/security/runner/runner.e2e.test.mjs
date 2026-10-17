import { afterEach, describe, expect, it } from 'vitest';
import { createProjects, interpreter, rowsOf } from './run-project.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, python, script } = createProjects();
afterEach(cleanup);

const OLD_PYTHON = enabled ? interpreter('3.9') : undefined;
const OLDEST_PYTHON = enabled ? interpreter('3.10') : undefined;

const BROKEN_HASHES = [
  'from security import hashes',
  'original = hashes.check',
  'def failing(context):',
  '    if context.path.endswith("broken.py"):',
  '        raise IndexError("list index out of range")',
  '    return original(context)',
  'hashes.check = failing',
].join('\n');

const SIGNING =
  'import hashlib\nimport hmac\n\nimport requests\n\nVERIFY = False\n\n\ndef sign(key, body, url):\n    requests.get(url, verify=VERIFY, timeout=5)\n    return hmac.new(key, body, hashlib.md5).hexdigest()\n';

function largeClass(methods) {
  const body = Array.from(
    { length: methods },
    (_, index) =>
      `    def handle_${String(index)}(self, order):\n        item = self.repo.get(order.id)\n        self.cache.set(order.id, item)\n        self.bus.publish("order-${String(index)}", item)\n        return self.session.get(self.url, timeout=5)\n`,
  );
  return `import requests\n\n\nclass OrderService:\n    def __init__(self, repo, bus, cache):\n        self.repo = repo\n        self.bus = bus\n        self.cache = cache\n        self.session = requests.Session()\n        self.url = "https://example.org"\n\n${body.join('\n')}`;
}

describe.skipIf(!enabled)('a failing security check', () => {
  it('costs only its own findings on its own file, reported as a check failure', () => {
    const { status, rules } = script(
      'python3',
      { 'broken.py': SIGNING, 'other.py': SIGNING },
      BROKEN_HASHES,
    );

    expect(status).toBe(0);
    expect(rowsOf(rules, ['weak-hmac', 'tls-verification-off', 'rules-check-failed'])).toEqual([
      'rules-check-failed broken.py:1 weak-hmac',
      'tls-verification-off broken.py:10 requests.get',
      'tls-verification-off other.py:10 requests.get',
      'weak-hmac other.py:11 hmac.new(md5)',
    ]);
    expect(rules.find(({ rule }) => rule === 'rules-check-failed').error).toBe(
      'IndexError: list index out of range',
    );
  });
});

describe.skipIf(!enabled)('the security checks on a large class', () => {
  it('stay linear: a 3,600-line class takes about four times a 900-line one, under the unit budget', () => {
    const files = { 'small.py': largeClass(150), 'service.py': largeClass(600) };
    const { stdout, status } = python('python3', files, [
      'import time',
      'import nitpicker_rules',
      'from security import hashes, loading',
      'from security.sql import check as sql',
      'from security.timeouts import check as timeouts',
      'from security.tls import check as tls',
      'for name in ("small.py", "service.py"):',
      '    start = time.perf_counter()',
      '    nitpicker_rules.check_all([name], {}, [sql, tls, hashes, timeouts, loading])',
      '    print(time.perf_counter() - start)',
    ]);
    const [small, large] = stdout.trim().split('\n').map(Number);

    expect(files['service.py'].split('\n').length).toBeGreaterThan(3600);
    expect(status).toBe(0);
    expect(large).toBeLessThan(4.5);
    expect(large / small).toBeLessThan(8);
  });
});

describe.skipIf(!enabled || OLD_PYTHON === undefined)('an interpreter below the minimum', () => {
  it('writes one skipped entry naming the interpreter instead of failing', () => {
    const { status, stderr, rules } = script(OLD_PYTHON, { 'mod.py': SIGNING });

    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(rules).toEqual([
      { rule: 'rules-skipped', path: '.', line: 1, subject: expect.stringMatching(/^3\.9\.\d+$/u) },
    ]);
  });
});

describe.skipIf(!enabled || OLDEST_PYTHON === undefined)('the oldest supported interpreter', () => {
  it('runs every check', () => {
    const { status, stderr, rules } = script(OLDEST_PYTHON, { 'mod.py': SIGNING });

    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(rules.filter(({ rule }) => rule.startsWith('rules-'))).toEqual([]);
    expect(rowsOf(rules, ['weak-hmac', 'tls-verification-off'])).toEqual([
      'tls-verification-off mod.py:10 requests.get',
      'weak-hmac mod.py:11 hmac.new(md5)',
    ]);
  });
});
