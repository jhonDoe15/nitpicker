interface Readable {
  on(event: 'data', listener: (chunk: any) => void): this;
  on(event: 'end', listener: () => void): this;
  setEncoding(encoding: string): this;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}
interface Socket {
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  on(event: 'end', listener: () => void): this;
}
interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
  includes(value: string): boolean;
}
declare const child: { stdout: Readable; stderr: Readable };
declare const socket: Socket;
declare const frames: AsyncIterable<Uint8Array>;
declare const messages: AsyncIterable<string>;
declare const READY: string;
declare const Readable: { from(items: unknown): Readable };
declare const other: { on(event: string, listener: (chunk: any) => void): void };
declare function done(): void;

export function guarded() {
  const parts: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => {
    parts.push(chunk);
  });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  other.on('data', (chunk) => {
    out += chunk;
  });
  child.stdout.on('close', (chunk) => {
    out += chunk;
  });
  child.stdout.on('data', (chunk) => {
    let local = '';
    local += chunk;
  });
  socket.on('data', (chunk: Buffer) => {
    out += chunk.toString('hex');
  });
  (async () => {
    for await (const message of messages) {
      out += message;
    }
    for await (const chunk of Readable.from(['a'])) {
      out += chunk;
    }
  })();
  const source = Readable.from(['a']);
  source.on('data', (chunk) => {
    out += chunk;
  });
  return out;
}
