import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { rule } from './no-chunkwise-stream-text.mts';

const STORE = [
  'export interface Buffer extends Uint8Array { toString(encoding?: string): string; includes(value: string): boolean }',
  'export declare const Buffer: { concat(parts: Buffer[]): Buffer };',
  'export interface Readable { on(event: "data", listener: (chunk: any) => void): this; on(event: "end", listener: () => void): this; setEncoding(encoding: string): this; [Symbol.asyncIterator](): AsyncIterableIterator<any> }',
  'export interface Socket { on(event: "data", listener: (chunk: Buffer) => void): this; on(event: "end", listener: () => void): this }',
  'export declare const child: { stdout: Readable; stderr: Readable };',
  'export declare const socket: Socket;',
  'export declare const frames: AsyncIterable<Uint8Array>;',
  'export declare const messages: AsyncIterable<string>;',
  'export declare const READY: string;',
  'export declare const Readable: { from(items: unknown): Readable };',
  'export declare const fs: { createReadStream(path: string, encoding?: string): Readable };',
].join('\n');

const { tester, typed } = typedIoProject('chunk-text', STORE);
const HEADER =
  "import { Buffer, child, socket, frames, messages, READY, Readable, fs } from './store';\n";

function body(code: string) {
  return typed(`${HEADER}${code}`);
}

const kinds = (messageId: 'collected' | 'decoded' | 'matched') => ({ messageId });

type Invalid = { readonly code: string; readonly id: 'collected' | 'decoded' | 'matched' };

const INVALID: readonly Invalid[] = [
  {
    code: 'let out = ""; child.stdout.on("data", (chunk) => { out += chunk; });',
    id: 'collected',
  },
  {
    code: 'let out = ""; child.stdout.on("data", (chunk) => { out += chunk.toString(); });',
    id: 'collected',
  },
  {
    code: 'let out = ""; child.stderr.on("data", (chunk) => { out += String(chunk); });',
    id: 'collected',
  },
  {
    code: 'let out = ""; socket.on("data", (chunk) => { out += chunk.toString("utf8"); });',
    id: 'collected',
  },
  {
    code: 'let out = ""; (async () => { for await (const chunk of child.stdout) { out += chunk; } })();',
    id: 'collected',
  },
  {
    code: 'const decoder = new TextDecoder(); const lines: string[] = []; (async () => { for await (const frame of frames) lines.push(decoder.decode(frame)); })();',
    id: 'decoded',
  },
  {
    code: 'const decoder = new TextDecoder(); socket.on("data", (chunk) => { decoder.decode(chunk); });',
    id: 'decoded',
  },
  {
    code: 'child.stdout.on("data", (chunk) => { if (String(chunk).includes(READY)) done(); });',
    id: 'matched',
  },
  {
    code: 'child.stdout.on("data", (chunk) => { if (chunk.toString().indexOf(READY) >= 0) done(); });',
    id: 'matched',
  },
  {
    code: 'socket.on("data", (chunk) => { if (chunk.includes(READY)) done(); });',
    id: 'matched',
  },
  {
    code: 'child.stdout.on("data", (chunk) => { if (/ready/.test(chunk.toString())) done(); });',
    id: 'matched',
  },
  {
    code: 'socket.on("data", (data: Buffer) => { const str = data.toString(); if (str.indexOf(READY) !== -1) done(); });',
    id: 'matched',
  },
];

tester.run('no-chunkwise-stream-text', rule, {
  valid: [
    'const parts: Buffer[] = []; child.stdout.on("data", (chunk: Buffer) => { parts.push(chunk); }); child.stdout.on("end", () => { Buffer.concat(parts).toString("utf8"); });',
    'let out = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { out += chunk; });',
    'let out = ""; child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { if (chunk.includes(READY)) out = "x"; });',
    'let out = ""; const encoding = "utf8"; child.stdout.on("data", (chunk) => { out += chunk; });',
    'let out = ""; other.on("data", (chunk) => { out += chunk; });',
    'let out = ""; child.stdout.on("close", (chunk) => { out += chunk; });',
    'child.stdout.on("data", (chunk) => { let local = ""; local += chunk; });',
    'let out = ""; child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString("hex"); });',
    'const decoder = new TextDecoder(); const lines: string[] = []; (async () => { for await (const frame of frames) lines.push(decoder.decode(frame, { stream: true })); })();',
    'const decoder = new TextDecoder(); socket.on("data", (chunk) => { decoder.decode(chunk, { stream: true }); });',
    'let out = ""; (async () => { for await (const message of messages) { out += message; } })();',
    'let out = ""; child.stdout.on("data", (chunk) => { out += "x"; if (out.includes(READY)) out = ""; });',
    'socket.on("data", (chunk) => { const view = chunk.length; });',
    'socket.on("data", (data: Buffer) => { const str = data.toString(); log(str); });',
    'let out = ""; (async () => { for await (const chunk of Readable.from(["a"])) { out += chunk; } })();',
    'const source = Readable.from(["a"]); let out = ""; source.on("data", (chunk) => { out += chunk; });',
    'let out = ""; (async () => { for await (const chunk of fs.createReadStream("x", "utf8")) { out += chunk; } })();',
  ].map(body),
  invalid: INVALID.map(({ code, id }) => ({ ...body(code), errors: [kinds(id)] })),
});
