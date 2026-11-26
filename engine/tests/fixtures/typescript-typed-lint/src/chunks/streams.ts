interface Readable {
  on(event: 'data', listener: (chunk: any) => void): this;
  on(event: 'end', listener: () => void): this;
  [Symbol.asyncIterator](): AsyncIterableIterator<any>;
}
interface Socket {
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  on(event: 'end', listener: () => void): this;
}
interface Buffer extends Uint8Array {
  toString(charset?: string): string;
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

export function collect() {
  let out = '';
  child.stdout.on('data', (chunk) => {
    out += chunk;
  });
  child.stderr.on('data', function reader(chunk) {
    out += chunk.toString();
  });
  socket.on('data', (chunk) => {
    out += String(chunk);
    out += chunk.toString('utf8');
  });
  (async () => {
    for await (const chunk of child.stdout) {
      out += chunk;
    }
    for await (const { length } of child.stdout) {
      out += length;
    }
  })();
  return out;
}

export function decoded() {
  const decoder = new TextDecoder();
  const lines: string[] = [];
  (async () => {
    for await (const frame of frames) {
      lines.push(decoder.decode(frame));
      lines.push(decoder.decode(frame, { stream: true }));
      lines.push(decoder.decode(frame, {}));
    }
  })();
  socket.on('data', (chunk) => {
    decoder.decode(chunk);
  });
  return lines;
}

export function matched() {
  child.stdout.on('data', (chunk) => {
    if (String(chunk).includes(READY)) done();
    if (chunk.toString().indexOf(READY) >= 0) done();
    if (/ready/.test(chunk.toString())) done();
  });
  socket.on('data', (chunk) => {
    if (chunk.includes(READY)) done();
  });
  socket.on('data', (data: Buffer) => {
    const str = data.toString();
    if (str.indexOf(READY) !== -1) done();
    const copy = str;
    copy.startsWith(READY);
  });
}

export function quiet() {
  const parts: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => {
    parts.push(chunk);
  });
  let out = '';
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

export async function targets(box: { text: string }) {
  let out = '';
  child.stdout.on('data', (chunk) => {
    box.text += chunk;
    out = out + chunk;
    out -= chunk;
    let inner = '';
    inner += chunk;
    undeclared += chunk;
  });
  child.stdout.on('data', function () {
    out += 'x';
  });
  child.stderr.on('data', ([first], chunk) => {
    out += first;
  });
  child.stderr.on('data', ({ value } = { value: 1 }) => {
    out += value;
  });
  child.stderr.once('data', (chunk = '') => {
    out += chunk;
  });
  for await (const chunk of child.stderr) out += chunk;
}
declare let undeclared: string;
