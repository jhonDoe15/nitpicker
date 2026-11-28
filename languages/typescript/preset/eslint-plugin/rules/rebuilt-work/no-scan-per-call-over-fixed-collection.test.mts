import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-scan-per-call-over-fixed-collection.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'scanPerCall' }] };
}

tester.run('no-scan-per-call-over-fixed-collection', rule, {
  valid: [
    'const codes = load(); function f(f) { return codes.find((k) => k === f); } export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { const f = 1; return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k.id === make(k[c])); } export const a = [f(1), f(2), f(3)];',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } find(path) { return this.routes.find((route) => route.path === path); } }',
    'export class Routes { private readonly routes = []; add(r) { this.routes.push(r); } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; find(path) { return this.routes.find((route) => route.path === "/"); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; find(path) { for (const p of path) { this.routes.find((route) => route.path === p); } } all(paths) { return paths.map((p) => this.find(p)); } }',
    'const codes = ["a", "b"]; function indexOf(code) { return codes.findIndex((known) => known === code); } export const first = () => indexOf("a");',
    'export const codes = load(); function indexOf(code) { return codes.findIndex((known) => known === code); } export function all(list) { return list.map((c) => indexOf(c)); }',
    'const codes = ["a", "b"]; function indexOf(code) { return codes.findIndex((known) => known === code); } export function all(list) { return list.map((c) => indexOf(c)); }',
    'const names = new Map([["a", 1]]); function named(n) { for (const e of names.values()) { if (e === n) { return e; } } return 0; } export function all(list) { return list.map((c) => named(c)); }',
    'let codes = load(); function indexOf(code) { return codes.findIndex((known) => known === code); } export function all(list) { codes = []; return list.map((c) => indexOf(c)); }',
    'export class Routes { private readonly routes = []; find(path, cfg) { return this.routes.find((route) => route.id === cfg.path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; clear() { this.routes.length = 0; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; set(i, r) { this.routes[i] = r; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; fill(r) { const list = this.routes; list.push(r); } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes = []; find(kind) { return this.routes.every((route) => route.kind === kind); } all(kinds) { return kinds.map((k) => this.find(k)); } }',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } hand() { register(this.routes); } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } copy() { let other; other = this.routes; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } bump() { this.routes[0]++; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } drop(i) { delete this.routes[i]; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'export class Routes { private readonly routes; constructor(r) { this.routes = r; } set(v) { this.routes = v; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    'const codes = load(); function f(c) { return codes.findIndex((k) => k === c); } export const g = (list) => list.map(f);',
    'const codes = load(); export default function (code) { return codes.findIndex((k) => k === code); }',
    'const codes = load(); export default (code) => codes.findIndex((k) => k === code);',
    'const codes = load(); const { x } = (code) => codes.findIndex((k) => k === code);',
    'export function f(p) { return [].find((x) => x === p); }',
    'export function f(p) { return [...[]].find((x) => x === p); }',
    'var codes = []; var codes = []; function f(c) { return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'function f(c) { return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'import codes from "x"; function f(c) { return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'export function f(c) { const codes = []; return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes.find(isMatch); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes.find(function (a, b) { return a === c; }); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes["find"]((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes.find((k) => k > c); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes.find((k) => { const x = 1; }); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return get()[c].find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'const codes = []; function f(c) { return codes[c]().find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k === c); } register(codes); export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k === c); } let o; o = codes; export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k === c); } codes[0]++; export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k === c); } delete codes[0]; export const a = [f(1), f(2), f(3)];',
    'const codes = load(); function f(c) { return codes.find((k) => k === c); } codes[0] = 1; export const a = [f(1), f(2), f(3)];',
  ],
  invalid: [
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k.id === make({ id: c })); } export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k.id === make({ [c]: 1 })); } export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k.id === make({ c })); } export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k.id === c.id); } export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'export class Routes { private readonly routes; constructor(r) { this.routes = r; } read() { return this.routes.length + other[this.routes]; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    ),
    invalid(
      'export class Routes { private readonly routes; constructor(r) { this.routes = r; } grab() { return this.routes.push; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    ),
    invalid(
      'export class Routes { private readonly routes; constructor(r) { this.routes = r; } drop() { return typeof this.routes; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    ),
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k === c); } const m = codes.push; export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'const codes = load(); function f(c) { return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3), codes.length];',
    ),
    invalid(
      'const codes = load(); const f = (c) => codes.find((k) => k === c); export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'declare const codes: string[]; function f(c) { return codes.find((k) => k === c); } export const a = [f(1), f(2), f(3)];',
    ),
    invalid(
      'export class Routes { private readonly routes; constructor(r) { this.routes = r; } find(path) { return this.routes.find((route) => route.path === path); } all(paths) { return paths.map((p) => this.find(p)); } }',
    ),
    invalid(
      'export class Index { private readonly byName = new Map(); named(name) { for (const entry of this.byName.values()) { if (entry.name === name) { return entry; } } return undefined; } run(names) { for (const n of names) { this.named(n); } } }',
    ),
    invalid(
      'const codes = load(); function indexOf(code) { return codes.findIndex((known) => known === code); } export const a = indexOf("a"); export const b = indexOf("b"); export const c = indexOf("c");',
    ),
  ],
});
