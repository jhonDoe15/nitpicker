import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './unbounded-reactive-fan-out.mjs';

const RX =
  'import { forkJoin, from, merge, combineLatest, zip, of, mergeMap, mergeAll, concatMap, bufferCount, toArray, map, defer, flatMap } from "rxjs";\n';
const HTTP = 'import { HttpClient } from "@angular/common/http";\n';
const tester = typescriptRuleTester();

function error(messageId, data) {
  return [{ messageId, data: { via: '', target: 'remote service', ...data } }];
}

function operator(data) {
  return error('operator', {
    operator: 'mergeMap',
    operation: 'fetch()',
    collection: 'ids',
    ...data,
  });
}

function combinator(data) {
  return error('combinator', {
    operator: 'forkJoin',
    operation: 'fetch()',
    collection: 'ids',
    ...data,
  });
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
    `${RX}forkJoin([from(fetch(a)), from(fetch(b))]);`,
    `${RX}forkJoin(["a", "b"].map((id) => from(fetch(id))));`,
    `${RX}forkJoin({ first: from(fetch(a)), second: from(fetch(b)) });`,
    `${RX}merge(...ids.map((id) => from(fetch(id))), 4);`,
    `${RX}forkJoin(ids.map((id) => of(id)));`,
    `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll(4));`,
    'from(ids).pipe(mergeMap((id) => from(fetch(id))));',
    'forkJoin(ids.map((id) => from(fetch(id))));',
    'const merged = ids.flatMap((id) => [fetch(id)]);',
    `${RX}${HTTP}class Feeds { constructor(private readonly http: HttpClient) {} all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id), 6)); } }`,
  ],
  invalid: [
    { code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id))));`, errors: operator() },
    {
      code: `${RX}from(ids).pipe(flatMap((id) => defer(() => fetch(id))));`,
      errors: operator({ operator: 'flatMap' }),
    },
    {
      code: `${RX}from(ids).pipe(mergeMap((id) => from(fetch(id)), Infinity));`,
      errors: operator(),
    },
    {
      code: `${RX}of(...ids).pipe(map((id) => id.trim()), mergeMap((id) => from(fetch(id))));`,
      errors: operator(),
    },
    {
      code: `${RX}const ids$ = from(ids); ids$.pipe(mergeMap((id) => from(fetch(id))));`,
      errors: operator(),
    },
    {
      code: `${RX}from(ids.map((id) => from(fetch(id)))).pipe(mergeAll());`,
      errors: operator({ operator: 'mergeAll' }),
    },
    {
      code: `${RX}${HTTP}class Feeds { constructor(private readonly http: HttpClient) {} all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id))); } }`,
      errors: operator({ operation: 'this.http.get()' }),
    },
    {
      code: `${RX}import { ajax } from "rxjs/ajax"; from(ids).pipe(mergeMap((id) => ajax.getJSON(id)));`,
      errors: operator({ operation: 'ajax.getJSON()' }),
    },
    {
      code: `${RX}const load = (id) => from(fetch(id)); from(ids).pipe(mergeMap(load));`,
      errors: operator(),
    },
    {
      code: `${RX}import * as rx from "rxjs"; rx.from(ids).pipe(rx.mergeMap((id) => rx.from(fetch(id))));`,
      errors: operator(),
    },
    {
      code: `${RX}import { take } from "rxjs"; from(ids).pipe(take(ids.length), mergeMap((id) => from(fetch(id))));`,
      errors: operator(),
    },
    {
      code: `${RX}from(ids).pipe(map((id) => from(fetch(id))), mergeAll());`,
      errors: operator({ operator: 'mergeAll' }),
    },
    {
      code: `${RX}${HTTP}import { inject } from "@angular/core"; class Feeds { private readonly http = inject(HttpClient); all(ids: string[]) { return from(ids).pipe(mergeMap((id) => this.http.get(id))); } }`,
      errors: operator({ operation: 'this.http.get()' }),
    },
    { code: `${RX}forkJoin(ids.map((id) => from(fetch(id))));`, errors: combinator() },
    {
      code: `${RX}combineLatest(ids.map((id) => from(fetch(id))));`,
      errors: combinator({ operator: 'combineLatest' }),
    },
    {
      code: `${RX}zip(ids.map((id) => from(fetch(id))));`,
      errors: combinator({ operator: 'zip' }),
    },
    {
      code: `${RX}merge(...ids.map((id) => from(fetch(id))));`,
      errors: combinator({ operator: 'merge' }),
    },
    {
      code: `${RX}const calls = ids.map((id) => from(fetch(id))); forkJoin(calls);`,
      errors: combinator(),
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
    '}',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const TYPED_RX = 'import { from, mergeMap } from "rxjs";\n';

function typed(code, errors) {
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
        'export function one(text: string) { return from(text).pipe(mergeMap((id: string) => fetch(id))); }',
      ),
    ],
    invalid: [
      typed(
        'export function all(ids: string[]) { return from(ids).pipe(mergeMap((id: string) => fetch(id))); }',
        operator(),
      ),
      typed(
        'export function all(ids: Set<string>) { return from(ids).pipe(mergeMap((id: string) => fetch(id))); }',
        operator(),
      ),
    ],
  },
);
