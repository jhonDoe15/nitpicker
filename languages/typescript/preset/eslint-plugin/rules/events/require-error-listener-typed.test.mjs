import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './require-error-listener.mjs';

const typeRoot = fileURLToPath(new URL('../../../../../../node_modules/@types', import.meta.url));
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-error-listener-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      allowJs: true,
      checkJs: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      typeRoots: [typeRoot],
      types: ['node'],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
);
for (const [name, text] of [
  [
    'imapflow',
    'import { EventEmitter } from "node:events"; export declare class ImapFlow extends EventEmitter { connect(): Promise<void>; }',
  ],
  [
    'fastify',
    'import type { Readable } from "node:stream"; export interface Reply { send(body: Readable): Reply; }',
  ],
  [
    'bus',
    'import { EventEmitter } from "node:events"; export declare class Bus extends EventEmitter {}',
  ],
]) {
  mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
  writeFileSync(path.join(root, 'node_modules', name, 'index.d.ts'), text);
  writeFileSync(
    path.join(root, 'node_modules', name, 'package.json'),
    JSON.stringify({ name, types: 'index.d.ts' }),
  );
}
mkdirSync(path.join(root, 'src'));
writeFileSync(
  path.join(root, 'src/guards.ts'),
  [
    'import type { EventEmitter } from "node:events";',
    'import { pipeline } from "node:stream/promises";',
    'import type { Readable, Writable } from "node:stream";',
    'export function guard(emitter: EventEmitter): void { emitter.on("data", () => {}).on("error", () => {}); }',
    'export function ignore(emitter: EventEmitter): void { emitter.on("data", () => {}); }',
    'export async function copy(input: Readable, output: Writable): Promise<void> { await pipeline(input, output); }',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, name, extension = 'ts') {
  const file = path.join(root, `src/case-${randomUUID()}.${extension}`);
  writeFileSync(file, code);
  return {
    filename: file,
    code,
    ...(name === undefined ? {} : { errors: [{ messageId: 'missingListener', data: { name } }] }),
  };
}

const MAILER =
  'import { ImapFlow } from "imapflow"; class Mailer extends ImapFlow {} export async function open() { const client = new Mailer(); await client.connect(); }';
const PROJECT_SOCKET =
  'import { Socket } from "node:net"; class Link extends Socket {} export function open(port: number) { const link = new Link(); link.connect(port); }';

tester.run('require-error-listener with types', rule, {
  valid: [
    typed(
      'import { createReadStream } from "node:fs"; import { guard } from "./guards"; export function read(path: string) { const stream = createReadStream(path); guard(stream); stream.resume(); }',
    ),
    typed(
      'import { createReadStream, createWriteStream } from "node:fs"; import { copy } from "./guards"; export async function run(a: string, b: string) { const input = createReadStream(a); await copy(input, createWriteStream(b).on("error", () => {})); }',
    ),
    typed(
      'import { createReadStream } from "node:fs"; export class Files { read(path: string) { const stream = createReadStream(path); this.watch(stream); stream.resume(); } private watch(stream: NodeJS.EventEmitter) { stream.on("error", () => {}); } }',
    ),
    typed(
      'import { createReadStream } from "node:fs"; import type { Reply } from "fastify"; export function send(reply: Reply, path: string) { const stream = createReadStream(path); reply.send(stream); }',
    ),
    typed(
      'import { Bus } from "bus"; export function start() { const bus = new Bus(); bus.emit("ready"); }',
    ),
    typed(
      'import { EventEmitter } from "node:events"; export function start() { const events = new EventEmitter(); events.emit("ready"); }',
    ),
    typed(
      'import { EventEmitter } from "node:events"; class Hub extends EventEmitter {} export function start() { const hub = new Hub(); hub.emit("ready"); }',
    ),
    typed(
      'import { ImapFlow } from "imapflow"; class Mailer extends ImapFlow {} export async function open() { const client = new Mailer(); client.on("error", () => {}); await client.connect(); }',
    ),
    typed(
      'import { Readable } from "node:stream"; class Lines extends Readable {} export function read(out) { const lines = new Lines(); lines.pipe(out); }',
      undefined,
      'js',
    ),
  ],
  invalid: [
    typed(MAILER, 'client'),
    typed(PROJECT_SOCKET, 'link'),
    typed(
      'import { createReadStream } from "node:fs"; function watch(stream: NodeJS.EventEmitter) { stream.on("data", () => {}); } export function read(path: string) { const stream = createReadStream(path); watch(stream); }',
      'stream',
    ),
    typed(
      'import { createReadStream } from "node:fs"; import { ignore } from "./guards"; export function read(path: string) { const stream = createReadStream(path); ignore(stream); }',
      'stream',
    ),
    typed(
      'import { createReadStream } from "node:fs"; export function read(path: string, out: NodeJS.WritableStream) { const stream = createReadStream(path); stream.pipe(out); }',
      'stream',
    ),
    typed(
      'import { spawn } from "node:child_process"; export function run() { const child = spawn("ls"); child.on("exit", () => {}); }',
      'child',
      'js',
    ),
  ],
});
