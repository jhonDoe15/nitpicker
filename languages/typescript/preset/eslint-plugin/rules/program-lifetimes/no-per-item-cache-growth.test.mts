import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-per-item-cache-growth.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'perItemCache' }] };
}

tester.run('no-per-item-cache-growth', rule, {
  valid: [
    'const tokensByFile = new Map(); export function lintAll(files) { for (const file of files) { tokensByFile.set(file.path, tokenize(file.text)); lint(file, tokensByFile.get(file.path)); tokensByFile.delete(file.path); } }',
    'const tokensByFile = new Map(); export function lintAll(files) { for (const file of files) { tokensByFile.set(file.path, tokenize(file.text)); lint(file, tokensByFile.get(file.path)); } } export const lookup = (p) => tokensByFile.get(p);',
    'export function index(files) { const byPath = new Map(); for (const file of files) { byPath.set(file.path, file); use(byPath.get(file.path)); } return byPath; }',
    'const seen = new Map(); export function f() { for (const k of ["a", "b"]) { seen.set(k, compute(k)); use(seen.get(k)); } }',
    'const cache = new Map(); export function f(files) { for (const file of files) { cache.set(file.path, parse(file)); use(cache.get(file.path)); } cache.clear(); }',
    'const cache = new Map(); export function f(files) { for (const file of files) { cache.set(file.path, parse(file)); } }',
    'const cache = new Map(); export function f(files, other) { for (const file of files) { cache.set(other, parse(file)); use(cache.get(other)); } }',
    'export const cache = new Map(); export function f(files) { for (const file of files) { cache.set(file.path, parse(file)); use(cache.get(file.path)); } }',
  ],
  invalid: [
    invalid(
      'const tokensByFile = new Map(); export function lintAll(files) { for (const file of files) { tokensByFile.set(file.path, tokenize(file.text)); lint(file, tokensByFile.get(file.path)); } }',
    ),
    invalid(
      'export class Linter { private readonly trees = new WeakMap(); run(files) { for (const file of files) { this.trees.set(file, parse(file)); check(this.trees.get(file)); } } }',
    ),
  ],
});
