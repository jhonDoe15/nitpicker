import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from '../../rules/async/no-sync-node-api-in-async.mts';
import { FS } from './sync-fs-test-support.mts';

const { tester, typed, cleanup } = typedCases('async-fs-typed-', { lib: ['ES2022', 'DOM'] });
const blocking = [{ messageId: 'blocking' }];

function fixed(code: string, output: string) {
  return typed(code, [
    { messageId: 'blocking', suggestions: [{ messageId: 'awaitTwin', output }] },
  ] as never);
}

tester.run('descriptor arguments with types', rule, {
  valid: [],
  invalid: [
    fixed(
      `${FS}export async function r(p: string) { return fs.readFileSync(p); }`,
      `${FS}export async function r(p: string) { return await fs.promises.readFile(p); }`,
    ),
    fixed(
      `${FS}export async function r(p: string | URL) { return fs.readFileSync(p); }`,
      `${FS}export async function r(p: string | URL) { return await fs.promises.readFile(p); }`,
    ),
    fixed(
      `${FS}export async function r(fd: string) { return fs.readFileSync(fd); }`,
      `${FS}export async function r(fd: string) { return await fs.promises.readFile(fd); }`,
    ),
    fixed(
      `${FS}declare class Buffer { readonly kind: 1 }\nexport async function r(p: Buffer) { return fs.readFileSync(p); }`,
      `${FS}declare class Buffer { readonly kind: 1 }\nexport async function r(p: Buffer) { return await fs.promises.readFile(p); }`,
    ),
    fixed(
      `${FS}export async function r(p: 'a' | \`b\${string}\`) { return fs.readFileSync(p); }`,
      `${FS}export async function r(p: 'a' | \`b\${string}\`) { return await fs.promises.readFile(p); }`,
    ),
    typed(`${FS}export async function r(h: any) { return fs.readFileSync(h); }`, blocking as never),
    typed(
      `${FS}export async function r(h: unknown) { return fs.readFileSync(h as string); }`,
      blocking as never,
    ),
    typed(
      `${FS}export async function r<T>(h: T) { return fs.readFileSync(h as never); }`,
      blocking as never,
    ),
    typed(
      `${FS}export async function r(h: string | Buffer | number) { return fs.readFileSync(h); }`,
      blocking as never,
    ),
    typed(
      `${FS}declare const out: number;\nexport async function r() { fs.writeFileSync(out, 'x'); }`,
      blocking as never,
    ),
    typed(
      `${FS}export async function r(p: number) { return fs.readFileSync(p); }`,
      blocking as never,
    ),
    typed(
      `${FS}export async function r(p: string | number) { return fs.writeFileSync(p, 'x'); }`,
      blocking as never,
    ),
    typed(
      `${FS}export async function r(p: 3) { return fs.appendFileSync(p, 'x'); }`,
      blocking as never,
    ),
  ],
});

afterAll(cleanup);
