import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-case-mismatched-lookup.mts';

const ruleTester = typescriptRuleTester();

function failing(messageId: 'original' | 'raw', codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId }] }));
}

ruleTester.run('no-case-mismatched-lookup', rule, {
  valid: cases([
    "const METHODS = ['get', 'post']; const ok = METHODS.includes(method.toLowerCase());",
    "const METHODS = new Set(['get', 'post']); const ok = METHODS.has(method.toLowerCase());",
    "const NAMES = ['GET', 'POST']; const ok = NAMES.includes(method.toUpperCase());",
    "const ok = ['get'].includes(method.toLowerCase());",
    "const NAMES = ['GET', 'POST']; const ok = NAMES.includes(method);",
    "const MAP = new Map([['a', 1], ['b', 2]]); const v = MAP.get(key.toLowerCase());",
    "const NAMES = ['GET', 'POST']; const ok = NAMES.some((n) => n.toLowerCase() === m.toLowerCase());",
    'function f(allowed, key) { return allowed.includes(key.toLowerCase()); }',
    'function f(names, key) { const set = new Set(names.map((n) => ' +
      'n.toLowerCase())); return set.has(key.toLowerCase()); }',
    "function f(key) { const set = new Set(['a']); set.add(key.toLowerCase()); return set.has(key.toLowerCase()); }",
    'function f(key) { const k = key.toLowerCase(); seen.add(k); return seen.has(k); }',
    'function f(key) { seen.add(key.toLowerCase()); return other.has(key); }',
    "function f(key) { const names = ['A']; return names.includes(key); }",
    'function f(a, b) { map.set(a.toLowerCase(), 1); return map.get(b); }',
    'function f(key) { return headers.get(key.toLowerCase()); }',
    "const NAMES = ['123', '-']; const ok = NAMES.includes(x.toLowerCase());",
  ]),
  invalid: [
    ...failing('original', [
      "const METHODS = ['GET', 'POST']; const ok = METHODS.includes(method.toLowerCase());",
      "const METHODS = new Set(['GET', 'Post']); const ok = METHODS.has(method.toLowerCase());",
      "const MAP = new Map([['A', 1]]); const v = MAP.get(key.toLowerCase());",
      "const ok = ['Get', 'post'].indexOf(m.toLowerCase()) >= 0;",
      "const NAMES = ['get', 'Post']; const ok = NAMES.includes(m.toUpperCase());",
      'function f(names, key) { const set = new Set(names); return set.has(key.toLowerCase()); }',
    ]),
    ...failing('raw', [
      'function f(name) { map.set(name.toLowerCase(), 1); return map.get(name); }',
      'function f(item) { seen.add(item.id.toLowerCase()); return seen.has(item.id); }',
      'class A { add(n) { this.byName.set(n.toLowerCase(), 1); } find(n) { return this.byName.get(n); } }',
    ]),
  ],
});
