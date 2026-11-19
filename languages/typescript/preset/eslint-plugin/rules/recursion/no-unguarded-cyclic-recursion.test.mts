import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { rule } from './no-unguarded-cyclic-recursion.mts';

const STORE = [
  'export interface Route { id: string; parent?: Route; children?: Route[]; deps: Route[] }',
  'export interface Shape { kind: string; types: Shape[] }',
].join('\n');

const { tester, typed } = typedIoProject('cyclic-recursion', STORE);
const HEADER = "import type { Route } from './store';\n";

function body(code: string) {
  return typed(`${HEADER}${code}`);
}

tester.run('no-unguarded-cyclic-recursion', rule, {
  valid: [
    'export function collect(error: unknown, seen = new Set<unknown>()): string[] { if (!(error instanceof Error) || seen.has(error)) return []; seen.add(error); return [error.message, ...collect(error.cause, seen)]; }',
    'export function path(route: Route, depth = 0): string[] { if (depth > 50) return []; return route.parent ? [route.id, ...path(route.parent, depth + 1)] : [route.id]; }',
    'export function walk(route: Route): string[] { return (route.children ?? []).flatMap((child) => walk(child)); }',
    'export function names(error: unknown): string[] { return error instanceof Error ? [error.message] : []; }',
    'export function path(route: Route): string[] { return [route.id, ...path({ id: "x" })]; }',
    'export function depthOf(route: Route): number { return route.parent ? depthOf(route.parent) + 1 : 0; }\nexport const unrelated = 1;'.replace(
      'depthOf(route.parent) + 1',
      '0',
    ),
    'export function f(value: any): number { return value.parent ? f(value.parent) : 0; }',
    'export function f(route: Route, visited: Set<Route>): number { return route.parent && !visited.has(route.parent) ? f(route.parent, visited) : 0; }',
    'const seen = new WeakSet<object>();\nexport function f(route: Route): number { if (seen.has(route)) return 0; seen.add(route); return route.parent ? f(route.parent) : 0; }',
    'export function path(route: Route): string[] { return route.parent ? [route.id, ...path(route.parent)] : [route.id]; }',
    'export function root(route: Route): Route { const next = route.parent; return next ? root(next) : route; }',
    'export class Walker { walk(route: Route): number { return route.parent ? this.walk(route.parent) : 0; } }',
    'export function f(route: Route): number { return route.parent ? g(route.parent) : 0; }\nfunction g(route: Route): number { return route.id.length; }',
  ].map(body),
  invalid: [
    'export function collect(error: unknown): string[] { return error instanceof Error ? [error.message, ...collect(error.cause)] : []; }',
    'export function path(route: Route): string[] { return route.deps.flatMap((dep) => path(dep)); }',
    'export const path = (route: Route): string[] => route.deps.flatMap((dep) => path(dep));',
    'export function count(route: Route): number { for (const dep of route.deps) { if (count(dep)) return 1; } return 0; }',
    'export function root(route: Route): number { const deps = route.deps; return deps.some((dep) => root(dep)) ? 1 : 0; }',
    'export function names(error: Error): string[] { const { cause } = error; return cause instanceof Error ? [error.message, ...names(cause)] : []; }',
    'export class Walker { walk(route: Route): number { return route.deps.some((dep) => this.walk(dep)) ? 1 : 0; } }',
    'export function f(error: unknown): number { return error instanceof Error ? 1 + f(error.cause as any) : 0; }',
  ].map((code) => ({ ...body(code), errors: [{ messageId: 'cyclic' as const }] })),
});
