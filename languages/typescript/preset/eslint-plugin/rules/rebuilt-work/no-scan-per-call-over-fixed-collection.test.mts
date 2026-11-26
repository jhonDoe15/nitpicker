import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-scan-per-call-over-fixed-collection.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'scanPerCall' }] };
}

tester.run('no-scan-per-call-over-fixed-collection', rule, {
  valid: [
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
  ],
  invalid: [
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
