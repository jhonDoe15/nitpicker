import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-shadowed-spread-key.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-spread-key-', { jsx: 'preserve' }, 'tsx');
afterAll(cleanup);

const HEADER =
  'declare namespace JSX { interface IntrinsicElements { [name: string]: unknown } }\n' +
  'declare function Button(props: { disabled?: boolean; label: string; id: string }): unknown;\n' +
  'type Data = { id?: string; name?: string; kind: string };\n' +
  'type RunOptions = { mode?: string; retries?: number; name: string };\n';

function found(key: string, messageId = 'explicitFirst') {
  return [{ messageId, data: { key } }];
}

tester.run('no-shadowed-spread-key', rule, {
  valid: [
    'export function f(id: string, data: Data) { return { ...data, id }; }',
    'export function f(id: string, data: Data) { return { id: "fixed", ...data }; }',
    'export function f(data: Data) { return { id: data.id, ...data }; }',
    'export function f(data: Data) { return { kind: "k", ...data }; }',
    'export function f(data: Data, extra: string) { return { extra, ...data }; }',
    'export function f(a: { x: number }, x: number) { return { x, ...a }; }',
    'export function f(options: RunOptions) { return { mode: "detailed", ...options }; }',
    'export function f(options: RunOptions) { return { ...options, name: "n" }; }',
    'export function f(options: RunOptions) { return { ...options, mode: undefined }; }',
    'type B = { debug?: boolean }; export function f(options: B) { return { ...options, debug: true }; }',
    'const fixed = "x"; export function f(data: Data) { return { id: fixed, ...data }; }',
    'export function f(data: Data) { const id = "x".trim(); return { id, ...data }; }',
    'export function f(options: RunOptions) { return { ...options, mode: options.mode ?? "detailed" }; }',
    'export function f(options: RunOptions) { const { mode: _ignored, ...rest } = options; return { ...rest, ' +
      'mode: "detailed" }; }',
    'export function f(data: Data) { const copy = data; return { ...copy, name: "n" }; }',
    'export function f(config: { a?: string; b: string }) { return { ...config, b: "x" }; }',
    'export function f(opts: { retries?: number }) { return { ...opts, other: 1 }; }',
    'export function f(a: Data, b: Data) { return { id: "1", ...a, ...b }; }',
    'export function f(p: { label: string; id: string }, loading: boolean) { return <Button {...p} ' +
      'disabled={loading} />; }',
    'export function f(p: { label: string; id: string }) { return <Button disabled label="x" {...p} />; }',
    'export function f(p: { label: string; id: string }, loading: boolean) { return <Button disabled={loading} ' +
      '{...p} />; }',
    'export function f(p: { label: string; id: string }) { return <Button id="a" {...p} />; }',
    'export function f(id: string, overrides?: Data) { return { id, kind: "x", ...overrides }; }',
    'export function f(id: string, requestDefaults: Data) { return { id, ...requestDefaults }; }',
    'export function f(id: string, reqOverrides: Data) { return { id, ...reqOverrides }; }',
    'export function f(signal: string) { return { signal, ...({ duplex: "half" } as { id?: string }) }; }',
  ].map((body) => typed(`${HEADER}${body}`)),
  invalid: [
    typed(
      `${HEADER}export function f(idOrSelector: string, data: Data) { return [{ id: idOrSelector, ...data }]; }`,
      found('id'),
    ),
    typed(
      `${HEADER}export function f(id: string, data: Data) { return { id, ...data }; }`,
      found('id'),
    ),
    typed(
      `${HEADER}export function f(start: { codexConfig: RunOptions }) { return { ...start.codexConfig, mode: ` +
        `"detailed" }; }`,
      found('mode', 'defaultAfter'),
    ),
    typed(
      `${HEADER}export function f(options: RunOptions) { return { ...options, retries: 3 }; }`,
      found('retries', 'defaultAfter'),
    ),
    typed(
      `${HEADER}export function f(p: { label: string; id: string; disabled?: boolean }, loading: boolean) { ` +
        `return <Button disabled={loading} {...p} />; }`,
      found('disabled'),
    ),
  ],
});
