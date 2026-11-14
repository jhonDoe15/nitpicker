import { typedCaseProject } from '../../../test-support/projects/typed-ts-project.mts';
import { rule as deadlineRule } from './promise-wait-deadline.mjs';
import { rule } from './require-promise-reject.mjs';

const PRELUDE = [
  'interface ErrnoException extends Error { code?: string }',
  'declare class Emitter { on(event: string, listener: (...values: unknown[]) => void): this; }',
  'declare class Socket extends Emitter { write(data: string): void; }',
  'declare class FileStream extends Emitter { path: string; }',
  'declare const server: { close(callback?: (err?: Error) => void): void };',
  'declare const rl: { question(query: string, callback: (answer: string) => void): void };',
  'declare function readFile(path: string, done: (failure: ErrnoException | null, data: string) => void): void;',
].join('\n');

type Errors = { messageId: string; data: Record<string, string> }[];

const { tester, typed } = typedCaseProject<Errors>({
  prefix: 'nitpicker-promise-reject-',
  lib: ['ES2022'],
  header: `${PRELUDE}\n`,
});

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
