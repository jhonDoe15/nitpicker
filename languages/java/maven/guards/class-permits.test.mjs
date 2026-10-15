import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { permittedSubclasses, runPermits } from './class-permits.mjs';

const roots = [];

function u2(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function u4(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function utf8(text) {
  return Buffer.concat([Buffer.from([1]), u2(Buffer.byteLength(text)), Buffer.from(text)]);
}

function classRef(index) {
  return Buffer.concat([Buffer.from([7]), u2(index)]);
}

function attribute(nameIndex, body) {
  return Buffer.concat([u2(nameIndex), u4(body.length), body]);
}

function classFile(self, permitted) {
  const pool = [
    utf8(self),
    classRef(1),
    Buffer.concat([Buffer.from([5]), Buffer.alloc(8)]),
    utf8('java/lang/Object'),
    classRef(5),
    utf8('PermittedSubclasses'),
    Buffer.concat([Buffer.from([3]), u4(42)]),
    ...permitted.flatMap((name, index) => [utf8(name), classRef(9 + 2 * index)]),
  ];
  const permits = Buffer.concat([
    u2(permitted.length),
    ...permitted.map((_, index) => u2(10 + 2 * index)),
  ]);
  return Buffer.concat([
    u4(0xcafebabe),
    u2(0),
    u2(65),
    u2(9 + 2 * permitted.length),
    ...pool,
    u2(0x0421),
    u2(2),
    u2(6),
    u2(1),
    u2(6),
    u2(1),
    Buffer.concat([u2(0), u2(5), u2(5), u2(1), attribute(5, Buffer.from([1, 2, 3]))]),
    u2(0),
    u2(2),
    attribute(5, Buffer.from([0, 0])),
    attribute(7, permits),
  ]);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('permittedSubclasses', () => {
  it('reads the PermittedSubclasses attribute past fields, long constants and other attributes', () => {
    expect(
      permittedSubclasses(classFile('demo/Shape', ['demo/a/Circle', 'demo/b/Square'])),
    ).toEqual(['demo.Shape -> demo.a.Circle', 'demo.Shape -> demo.b.Square']);
  });

  it('finds nothing on a class that permits nothing', () => {
    expect(permittedSubclasses(classFile('demo/Plain', []))).toEqual([]);
  });
});

describe('runPermits', () => {
  it('writes the permits edges of every main class, in path order', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-permits-'));
    roots.push(root);
    const outputDirectory = path.join(root, 'classes');
    mkdirSync(path.join(outputDirectory, 'demo'), { recursive: true });
    writeFileSync(
      path.join(outputDirectory, 'demo/Shape.class'),
      classFile('demo/Shape', ['demo/Circle']),
    );
    writeFileSync(
      path.join(outputDirectory, 'demo/Animal.class'),
      classFile('demo/Animal', ['demo/Cat']),
    );
    writeFileSync(path.join(outputDirectory, 'demo/notes.txt'), 'not a class');

    runPermits({ module: { outputDirectory }, reportDir: root });

    expect(readFileSync(path.join(root, 'permits.txt'), 'utf8')).toBe(
      'demo.Animal -> demo.Cat\ndemo.Shape -> demo.Circle\n',
    );
  });

  it('writes an empty report when the module has no classes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-permits-'));
    roots.push(root);

    runPermits({ module: { outputDirectory: path.join(root, 'missing') }, reportDir: root });

    expect(readFileSync(path.join(root, 'permits.txt'), 'utf8')).toBe('');
  });
});
