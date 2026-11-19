import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-fallback-spread-');
afterAll(cleanup);
const untyped = typescriptRuleTester();

const PRE = 'export {}; enum Mode { A, B } interface Opts { a?: number } class Box { v = 1; }';

function errors(operator: string) {
  return [{ messageId: 'fallbackInSpread', data: { operator } }];
}

function fixes(declaration: string, spread: string, output: string, operator = '??') {
  const code = (inner: string) => `${PRE} ${declaration} export const r = { ${inner} };`;
  return {
    ...typed(code(spread), errors(operator)),
    output: code(output),
  };
}

function declines(declaration: string, spread: string, operator = '??') {
  const code = `${PRE} ${declaration} export const r = { ${spread} };`;
  return { ...typed(code, errors(operator)), output: null };
}

function plain(code: string, operator: string, output: string | null) {
  return {
    filename: '/repo/src/main/features/billing/domain/options.mjs',
    code,
    errors: errors(operator),
    output,
  };
}

const spreadable = [
  'Opts | undefined',
  'Opts | null',
  'Opts',
  'any',
  'object',
  'object | undefined',
  '{}',
  'Function',
  '(() => void) | undefined',
  'Record<string, string> | undefined',
  'Box | undefined',
  'number[] | undefined',
  'Map<string, string> | undefined',
  '{ a: 1 } & { b: 2 }',
  '{ a: 1 } | null',
];

const rejected = [
  'string',
  'string | undefined',
  'number',
  'number | undefined',
  'boolean | undefined',
  'unknown',
  'unknown | undefined',
  'symbol | undefined',
  'bigint | undefined',
  'Mode | undefined',
  'Opts | string',
  'Opts | number | undefined',
  'string & { brand: 1 }',
  'never',
  'null',
  'undefined',
  "'a' | undefined",
];

tester.run('fallback spread fix', rule, {
  valid: [],
  invalid: [
    ...spreadable.flatMap((type) => [
      fixes(`declare const x: ${type};`, '...(x ?? {})', '...x'),
      fixes(`declare const x: ${type};`, '...(x || {})', '...x', '||'),
    ]),
    ...rejected.flatMap((type) => [
      declines(`declare const x: ${type};`, '...(x ?? {})'),
      declines(`declare const x: ${type};`, '...(x || {})', '||'),
    ]),
    declines('declare const n: 1;', '...(n ?? {})'),
    fixes('declare const x: Opts | undefined;', '...((x ?? {}))', '...x'),
    fixes('declare const x: Opts | undefined;', '...((x) ?? {})', '...x'),
    fixes('declare const x: Opts | undefined;', 'a: 1, ...(x ?? {}), b: 2', 'a: 1, ...x, b: 2'),
    fixes(
      'declare const c: { admin?: Opts } | undefined;',
      '...(c?.admin || {})',
      '...c?.admin',
      '||',
    ),
    fixes(
      'declare function load(): Promise<{ meta?: Opts } | undefined>;',
      '...((await load())?.meta ?? {})',
      '...(await load())?.meta',
    ),
    fixes('declare const w: Window;', '...((w as any).Clerk || {})', '...(w as any).Clerk', '||'),
    fixes(
      'declare const a: Opts | undefined; declare const b: Opts;',
      '...((a || b) ?? {})',
      '...a || b',
    ),
    fixes(
      'declare const a: Opts | undefined; declare const b: Opts;',
      '...(a && b || {})',
      '...a && b',
      '||',
    ),
    fixes(
      'declare const a: Opts | undefined; declare const b: boolean;',
      '...((b ? a : undefined) ?? {})',
      '...b ? a : undefined',
    ),
    fixes('declare const o: { r: { x?: Opts } };', '...(o.r.x ?? {}), k: 1', '...o.r.x, k: 1'),
    fixes('declare const g: () => Opts | undefined;', '...(g() ?? {})', '...g()'),
    declines('declare const a: Opts; declare const b: Opts;', '...((a, b) ?? {})'),
    declines('declare const x: Opts | undefined;', '...(x ?? /* default */ {})'),
    declines('declare const x: Opts | undefined;', '...(/* keep */ x ?? {})'),
    declines('declare const x: Opts | undefined;', '...(x ?? {} /* none */)'),
    declines('declare const x: Opts | undefined;', '...((x ?? {}) as Opts)'),
    declines('declare const x: Opts | undefined;', '...((x ?? {})!)'),
    declines('declare const x: Opts | undefined;', '...((x ?? {}) satisfies Opts)'),
    declines('declare const x: string | Opts | undefined;', '...(x ?? {})'),
  ],
});

const [genericFix, genericDecline, constrainedDecline, constrainedFix] = [
  `export {}; export function f<T>(x: T | undefined) { return { ...(x ?? {}) }; }`,
  `export {}; export function f<T extends string>(x: T | undefined) { return { ...(x ?? {}) }; }`,
  `export {}; export function f<T extends unknown>(x: T) { return { ...(x ?? {}) }; }`,
  `export {}; export function f<T extends { a: 1 } | undefined>(x: T) { return { ...(x ?? {}) }; }`,
];

tester.run('fallback spread fix on type parameters', rule, {
  valid: [],
  invalid: [
    {
      ...typed(genericFix, errors('??')),
      output: genericFix.replace('...(x ?? {})', '...x'),
    },
    {
      ...typed(constrainedFix, errors('??')),
      output: constrainedFix.replace('...(x ?? {})', '...x'),
    },
    { ...typed(genericDecline, errors('??')), output: null },
    { ...typed(constrainedDecline, errors('??')), output: null },
  ],
});

untyped.run('fallback spread fix without types', rule, {
  valid: [
    'export const a = [...(x ?? [])];',
    'export const a = { ...(x ?? { y: 1 }) };',
    'export const a = { ...x };',
  ].map((code) => ({ filename: '/repo/src/main/features/billing/domain/options.mjs', code })),
  invalid: [
    plain('export const a = { ...(x ?? {}) };', '??', 'export const a = { ...x };'),
    plain('export const a = { ...(x || {}), b: 1 };', '||', 'export const a = { ...x, b: 1 };'),
    plain('export const a = { ...(0 || {}) };', '||', 'export const a = { ...0 };'),
    plain(
      'request[part] = { ...(request[part] ?? {}), ...extra };',
      '??',
      'request[part] = { ...request[part], ...extra };',
    ),
    plain('export const a = { ...(x?.y ?? {}) };', '??', 'export const a = { ...x?.y };'),
    plain('export const a = { ...((x, y) ?? {}) };', '??', null),
    plain('export const a = { ...(x ?? /* d */ {}) };', '??', null),
    {
      filename: '/repo/src/main/features/billing/domain/options.ts',
      code: 'export const a = { ...(x ?? {}) };',
      errors: errors('??'),
      output: null,
    },
    {
      filename: '/repo/src/main/features/billing/domain/options.tsx',
      code: 'export const a = { ...(x ?? {}) };',
      errors: errors('??'),
      output: null,
    },
    {
      filename: '/repo/src/main/features/billing/domain/options.cjs',
      code: 'module.exports = { ...(x ?? {}) };',
      errors: errors('??'),
      output: 'module.exports = { ...x };',
    },
    {
      filename: '/repo/src/main/features/billing/domain/options.jsx',
      code: 'export const a = { ...(x || {}) };',
      errors: errors('||'),
      output: 'export const a = { ...x };',
    },
  ],
});
