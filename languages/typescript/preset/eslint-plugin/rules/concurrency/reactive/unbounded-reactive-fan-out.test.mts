import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './unbounded-reactive-fan-out.mts';

const RX =
  'import { forkJoin, from, merge, combineLatest, zip, of, mergeMap, mergeAll, concatMap, bufferCount, toArray, map, defer, flatMap } from "rxjs";\n';
const HTTP = 'import { HttpClient } from "@angular/common/http";\n';
const tester = typescriptRuleTester();

function error(messageId: string, data: Record<string, string>) {
  return [{ messageId, data: { via: '', target: 'remote service', ...data } }];
}

function bounded(output: string) {
  return [{ messageId: 'limit' as const, data: { limit: '8' }, output }];
}

function operator(data: Record<string, string> = {}, output?: string) {
  return [
    {
      ...error('operator', {
        operator: 'mergeMap',
        operation: 'fetch()',
        collection: 'ids',
        ...data,
      })[0],
      ...(output === undefined ? {} : { suggestions: bounded(output) }),
    },
  ];
}

function forkJoin(data: Record<string, string> = {}) {
  return error('forkJoin', { operation: 'fetch()', collection: 'ids', ...data });
}

function merged(output: string) {
  return [
    {
      ...error('merge', { operation: 'fetch()', collection: 'ids' })[0],
      suggestions: bounded(output),
    },
  ];
}

tester.run('unbounded-reactive-fan-out', rule, {
  valid: [
    `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));`,
    `${RX}const LIMIT = 4; from(ids).pipe(mergeMap((id) => from(fetch(id)), LIMIT));`,
    `${RX}export function load(ids, limit) { return from(ids).pipe(mergeMap((id) => from(fetch(id)), limit)); }`,
    `${RX}from(ids).pipe(concatMap((id) => from(fetch(id))));`,
    `${RX}import { first } from "rxjs"; from(ids).pipe(first(), mergeMap((id) => from(fetch(id))));`,
    `${RX}from(ids).pipe(map((id) => id.trim()), mergeAll());`,
    `${RX}${HTTP}import { inject } from "@angular/core"; class Feeds { private readonly http = inject(HttpClient); all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id), 4)); } }`,
    `${RX}declare function load(id: string): Promise<string>; from(ids).pipe(mergeMap((id) => from(load(id))));`,
    `${RX}declare function load(id: string): Promise<string>; from(ids).pipe(mergeMap(load));`,
    `${RX}import { take } from "rxjs"; from(ids).pipe(take(10), mergeMap((id) => from(fetch(id))));`,
    `${RX}from(ids).pipe(bufferCount(20), mergeMap((batch) => from(fetch(batch.join()))));`,
    `${RX}from(ids).pipe(mergeMap((id) => of(id.trim())));`,
    `${RX}from(["a", "b"]).pipe(mergeMap((id) => from(fetch(id))));`,
    `${RX}const HOSTS = ["a", "b"]; from(HOSTS).pipe(mergeMap((id) => from(fetch(id))));`,
    `${RX}from(fetch(url)).pipe(mergeMap((response) => from(fetch(response.url))));`,
    `${RX}clicks$.pipe(mergeMap(() => from(fetch(url))));`,
    `${RX}combineLatest(ids.map((id) => from(fetch(id))));`,
    `${RX}zip(ids.map((id) => from(fetch(id))));`,
    `${RX}zip(...ids.map((id) => from(fetch(id))));`,
    `${RX}forkJoin([from(fetch(a)), from(fetch(b))]);`,
    `${RX}forkJoin(["a", "b"].map((id) => from(fetch(id))));`,
    `${RX}forkJoin({ first: from(fetch(a)), second: from(fetch(b)) });`,
    `${RX}merge(...ids.map((id) => from(fetch(id))), 4);`,
    `${RX}merge(...ids.map((id) => from(fetch(id))), limit);`,
    `${RX}merge(...ids.map((id) => from(fetch(id))), options.limit);`,
    `${RX}merge(...ids.map((id) => from(fetch(id))), getLimit());`,
    `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(limit));`,
    `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), (id, response) => [id, response], 4));`,
    `${RX}const selector = (id, response) => [id, response]; from(ids).pipe(mergeMap((id) => from(fetch(id)), selector, 4));`,
    `${RX}export function load(ids, limit?: number) { return from(ids).pipe(mergeMap((id) => from(fetch(id)), limit)); }`,
    `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), 0));`,
    `${RX}forkJoin(ids.map((id) => of(id)));`,
    `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(4));`,
    'from(ids).pipe(mergeMap((id) => from(fetch(id))));',
    'forkJoin(ids.map((id) => from(fetch(id))));',
    'const merged = ids.flatMap((id) => [fetch(id)]);',
    `${RX}${HTTP}class Feeds { constructor(private readonly http: HttpClient) {} all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id), 6)); } }`,
  ],
  invalid: [
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id))));`,
      errors: operator({}, `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));`),
    },
    {
      code: `${RX}from(ids).pipe(flatMap((id) => defer(() => fetch(id))));`,
      errors: operator(
        { operator: 'flatMap' },
        `${RX}from(ids).pipe(flatMap((id) => defer(() => fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), Infinity));`,
      errors: operator({}, `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));`),
    },
    {
      code: `${RX}of(...ids).pipe(map((id) => id.trim()), mergeMap((id) => from(fetch(id))));`,
      errors: operator(
        {},
        `${RX}of(...ids).pipe(map((id) => id.trim()), mergeMap((id) => from(fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}const ids$ = from(ids); ids$.pipe(mergeMap((id) => from(fetch(id))));`,
      errors: operator(
        {},
        `${RX}const ids$ = from(ids); ids$.pipe(mergeMap((id) => from(fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll());`,
      errors: operator(
        { operator: 'mergeAll' },
        `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));`,
      ),
    },
    {
      code: `${RX}${HTTP}class Feeds { constructor(private readonly http: HttpClient) {} all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id))); } }`,
      errors: operator(
        { operation: 'this.http.get()' },
        `${RX}${HTTP}class Feeds { constructor(private readonly http: HttpClient) {} all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id), 8)); } }`,
      ),
    },
    {
      code: `${RX}import { ajax } from "rxjs/ajax"; from(ids).pipe(mergeMap((id) => ajax.getJSON(id)));`,
      errors: operator(
        { operation: 'ajax.getJSON()' },
        `${RX}import { ajax } from "rxjs/ajax"; from(ids).pipe(mergeMap((id) => ajax.getJSON(id), 8));`,
      ),
    },
    {
      code: `${RX}const load = (id) => from(fetch(id)); from(ids).pipe(mergeMap(load));`,
      errors: operator(
        {},
        `${RX}const load = (id) => from(fetch(id)); from(ids).pipe(mergeMap(load, 8));`,
      ),
    },
    {
      code: `${RX}import * as rx from "rxjs"; rx.from(ids).pipe(rx.mergeMap((id) => rx.from(fetch(id))));`,
      errors: operator(
        {},
        `${RX}import * as rx from "rxjs"; rx.from(ids).pipe(rx.mergeMap((id) => rx.from(fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}import { take } from "rxjs"; from(ids).pipe(take(ids.length), mergeMap((id) => from(fetch(id))));`,
      errors: operator(
        {},
        `${RX}import { take } from "rxjs"; from(ids).pipe(take(ids.length), mergeMap((id) => from(fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll());`,
      errors: operator(
        { operator: 'mergeAll' },
        `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(8));`,
      ),
    },
    {
      code: `${RX}${HTTP}import { inject } from "@angular/core"; class Feeds { private readonly http = inject(HttpClient); all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id))); } }`,
      errors: operator(
        { operation: 'this.http.get()' },
        `${RX}${HTTP}import { inject } from "@angular/core"; class Feeds { private readonly http = inject(HttpClient); all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id), 8)); } }`,
      ),
    },
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), (id, response) => [id, response]));`,
      errors: operator(),
    },
    {
      code: `${RX}const pair = (id, response) => [id, response]; from(ids).pipe(mergeMap((id) => from(fetch(id)), pair));`,
      errors: operator(),
    },
    {
      code: `${RX}function pair(id, response) { return [id, response]; } from(ids).pipe(flatMap((id) => from(fetch(id)), pair));`,
      errors: operator({ operator: 'flatMap' }),
    },
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), undefined));`,
      errors: operator({}, `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));`),
    },
    {
      code: `${RX}const NONE = Number.POSITIVE_INFINITY; from(ids).pipe(mergeMap((id) => from(fetch(id)), NONE));`,
      errors: operator(
        {},
        `${RX}const NONE = Number.POSITIVE_INFINITY; from(ids).pipe(mergeMap((id) => from(fetch(id)), 8));`,
      ),
    },
    {
      code: `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(Infinity));`,
      errors: operator(
        { operator: 'mergeAll' },
        `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(8));`,
      ),
    },
    {
      code: `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(Number.POSITIVE_INFINITY));`,
      errors: operator(
        { operator: 'mergeAll' },
        `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(8));`,
      ),
    },
    {
      code: `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(undefined));`,
      errors: operator(
        { operator: 'mergeAll' },
        `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll(8));`,
      ),
    },
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))), asyncScheduler);`,
      errors: error('merge', { operation: 'fetch()', collection: 'ids' }),
    },
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))), this.scheduler);`,
      errors: error('merge', { operation: 'fetch()', collection: 'ids' }),
    },
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))), Infinity);`,
      errors: error('merge', { operation: 'fetch()', collection: 'ids' }),
    },
    { code: `${RX}forkJoin(ids.map((id) => from(fetch(id))));`, errors: forkJoin() },
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))));`,
      errors: merged(`${RX}merge(...ids.map((id) => from(fetch(id))), 8);`),
    },
    {
      code: `${RX}const calls = ids.map((id) => from(fetch(id))); forkJoin(calls);`,
      errors: forkJoin(),
    },
  ],
});

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-reactive-fan-out-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      noEmit: true,
      types: [],
      lib: ['ES2022', 'DOM'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));
writeFileSync(
  path.join(root, 'src/rxjs.d.ts'),
  [
    'declare module "rxjs" {',
    '  export function from<T>(input: Iterable<T> | PromiseLike<T>): { pipe(...operators: unknown[]): unknown };',
    '  export function mergeMap<T>(project: (value: T) => unknown, limit?: number): unknown;',
    '  export function merge(...inputs: unknown[]): unknown;',
    '  export const asyncScheduler: { schedule(work: () => void): unknown };',
    '}',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const TYPED_RX = 'import { from, mergeMap, merge, asyncScheduler } from "rxjs";\n';

function typed(code: string): { filename: string; code: string };
function typed(
  code: string,
  errors: ReturnType<typeof operator>,
): { filename: string; code: string; errors: ReturnType<typeof operator> };
function typed(code: string, errors?: ReturnType<typeof operator>) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  const text = `${TYPED_RX}${code}`;
  writeFileSync(file, text);
  return { filename: file, code: text, ...(errors === undefined ? {} : { errors }) };
}

typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }).run(
  'unbounded-reactive-fan-out with types',
  rule,
  {
    valid: [
      typed(
        'export function one(pending: Promise<string>) { return from(pending).pipe(mergeMap((id: string) => fetch(id))); }',
      ),
      typed(
        'export function all(ids: string[], limit: number) { return merge(...ids.map((id) => from(fetch(id))), limit); }',
      ),
      typed(
        'declare const MAX: 4 | 8; export function all(ids: string[]) { return merge(...ids.map((id) => from(fetch(id))), MAX); }',
      ),
      typed(
        'export function one(text: string) { return from(text).pipe(mergeMap((id: string) => fetch(id))); }',
      ),
    ],
    invalid: [
      typed(
        'export function all(ids: string[]) { return merge(...ids.map((id) => from(fetch(id))), asyncScheduler); }',
        error('merge', { operation: 'fetch()', collection: 'ids' }),
      ),
      typed(
        'declare const queue: { schedule(work: () => void): unknown }; export function all(ids: string[]) { return merge(...ids.map((id) => from(fetch(id))), queue); }',
        error('merge', { operation: 'fetch()', collection: 'ids' }),
      ),
      typed(
        'export function all(ids: string[]) { return from(ids).pipe(mergeMap((id: string) => fetch(id))); }',
        operator(
          {},
          `${TYPED_RX}export function all(ids: string[]) { return from(ids).pipe(mergeMap((id: string) => fetch(id), 8)); }`,
        ),
      ),
      typed(
        'export function all(ids: Set<string>) { return from(ids).pipe(mergeMap((id: string) => fetch(id))); }',
        operator(
          {},
          `${TYPED_RX}export function all(ids: Set<string>) { return from(ids).pipe(mergeMap((id: string) => fetch(id), 8)); }`,
        ),
      ),
    ],
  },
);
