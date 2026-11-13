import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule as deadlineRule } from './promise-wait-deadline.mjs';
import { rule } from './require-promise-reject.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-promise-reject-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: { strict: true, module: 'esnext', noEmit: true, types: [], lib: ['ES2022'] },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

const PRELUDE = [
  'interface ErrnoException extends Error { code?: string }',
  'declare class Emitter { on(event: string, listener: (...values: unknown[]) => void): this; }',
  'declare class Socket extends Emitter { write(data: string): void; }',
  'declare class FileStream extends Emitter { path: string; }',
  'declare const server: { close(callback?: (err?: Error) => void): void };',
  'declare const rl: { question(query: string, callback: (answer: string) => void): void };',
  'declare function readFile(path: string, done: (failure: ErrnoException | null, data: string) => void): void;',
].join('\n');

function typed(body, errors) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  const code = `${PRELUDE}\n${body}`;
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

tester.run('require-promise-reject (typed)', rule, {
  valid: [
    typed(
      'export const read = (p: string) => new Promise<string>((resolve, reject) => readFile(p, (failure, data) => (failure ? reject(failure) : resolve(data))));',
    ),
    typed(
      'export const ask = (q: string) => new Promise<string>((resolve, reject) => { server.close(reject); rl.question(q, resolve); });',
    ),
    typed(
      'export const ask = (q: string) => new Promise<string>((resolve, reject) => { server.close(reject); rl.question(q, (answer) => resolve(answer)); });',
    ),
  ],
  invalid: [
    typed(
      'export const read = (p: string) => new Promise<string>((resolve, reject) => { server.close(reject); readFile(p, (failure, data) => resolve(data)); });',
      [{ messageId: 'ignoredError', data: { name: 'failure', callee: 'readFile' } }],
    ),
    typed(
      'export const read = (p: string) => new Promise<void>((resolve, reject) => { rl.question(p, reject); readFile(p, () => resolve()); });',
      [{ messageId: 'missingErrorParameter', data: { callee: 'readFile' } }],
    ),
    typed(
      'export const stop = () => new Promise<unknown>((resolve, reject) => { rl.question("?", reject); server.close(resolve); });',
      [{ messageId: 'resolvesWithError', data: { name: 'resolve', callee: 'server.close' } }],
    ),
  ],
});

tester.run('promise-wait-deadline (typed)', deadlineRule, {
  valid: [
    typed(
      'export const read = (input: FileStream) => new Promise((resolve, reject) => { input.on("end", resolve); input.on("error", reject); });',
    ),
  ],
  invalid: [
    typed(
      'export const read = (peer: Socket) => new Promise((resolve, reject) => { peer.on("end", resolve); peer.on("error", reject); });',
      [{ messageId: 'noDeadline', data: { receiver: 'peer' } }],
    ),
  ],
});
