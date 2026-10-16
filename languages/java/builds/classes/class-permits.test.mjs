import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { permittedSubclasses, runPermits } from './class-permits.mjs';

const roots = [];
const CONSTANTS = [
  ['Integer', 3, 4, 1],
  ['Float', 4, 4, 1],
  ['Long', 5, 8, 2],
  ['Double', 6, 8, 2],
  ['String', 8, 2, 1],
  ['Fieldref', 9, 4, 1],
  ['Methodref', 10, 4, 1],
  ['InterfaceMethodref', 11, 4, 1],
  ['NameAndType', 12, 4, 1],
  ['MethodHandle', 15, 3, 1],
  ['MethodType', 16, 2, 1],
  ['Dynamic', 17, 4, 1],
  ['InvokeDynamic', 18, 4, 1],
  ['Module', 19, 2, 1],
  ['Package', 20, 2, 1],
];

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
  const bytes = typeof text === 'string' ? Buffer.from(text) : text;
  return Buffer.concat([Buffer.from([1]), u2(bytes.length), bytes]);
}

function classRef(index) {
  return Buffer.concat([Buffer.from([7]), u2(index)]);
}

function attribute(nameIndex, body) {
  return Buffer.concat([u2(nameIndex), u4(body.length), body]);
}

function constant(tag, size) {
  return Buffer.concat([Buffer.from([tag]), Buffer.alloc(size, 0xff)]);
}

function classFile(self, permitted, extra = []) {
  const slots = extra.reduce((total, { slots: used }) => total + used, 0);
  const first = 6 + slots;
  const pool = [
    utf8(self),
    classRef(1),
    utf8('java/lang/Object'),
    classRef(3),
    utf8('PermittedSubclasses'),
    ...extra.map(({ bytes }) => bytes),
    ...permitted.flatMap((name, index) => [utf8(name), classRef(first + 2 * index)]),
  ];
  const permits = Buffer.concat([
    u2(permitted.length),
    ...permitted.map((_, index) => u2(first + 1 + 2 * index)),
  ]);
  return Buffer.concat([
    u4(0xcafebabe),
    u2(0),
    u2(65),
    u2(first + 2 * permitted.length),
    ...pool,
    u2(0x0421),
    u2(2),
    u2(4),
    u2(1),
    u2(4),
    u2(1),
    Buffer.concat([u2(0), u2(3), u2(3), u2(1), attribute(3, Buffer.from([1, 2, 3]))]),
    u2(0),
    u2(2),
    attribute(3, Buffer.from([0, 0])),
    attribute(5, permits),
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

  it.each(CONSTANTS)('skips a %s constant (tag %i) in the constant pool', (_, tag, size, slots) => {
    const extra = [{ bytes: constant(tag, size), slots }];

    expect(
      permittedSubclasses(classFile('demo/Shape', ['demo/a/Circle', 'demo/b/Square'], extra)),
    ).toEqual(['demo.Shape -> demo.a.Circle', 'demo.Shape -> demo.b.Square']);
  });

  it('skips every kind of constant together', () => {
    const extra = CONSTANTS.map(([, tag, size, slots]) => ({ bytes: constant(tag, size), slots }));

    expect(permittedSubclasses(classFile('demo/Shape', ['demo/a/Circle'], extra))).toEqual([
      'demo.Shape -> demo.a.Circle',
    ]);
  });

  it('decodes modified UTF-8 names with two-byte and three-byte characters', () => {
    expect(
      permittedSubclasses(
        classFile('demo/F\u00f3rma', [
          'demo/\u00f1and\u00fa',
          'demo/\u20aco/Pre\u00e7o\u20ac',
          'demo/\u0434\u0435\u043c\u043e',
          'demo/plain',
        ]),
      ),
    ).toEqual([
      'demo.F\u00f3rma -> demo.\u00f1and\u00fa',
      'demo.F\u00f3rma -> demo.\u20aco.Pre\u00e7o\u20ac',
      'demo.F\u00f3rma -> demo.\u0434\u0435\u043c\u043e',
      'demo.F\u00f3rma -> demo.plain',
    ]);
  });

  it('decodes the overlong null and the surrogate pairs of modified UTF-8', () => {
    const nul = Buffer.concat([Buffer.from('demo/a'), Buffer.from([0xc0, 0x80]), Buffer.from('b')]);
    const pair = Buffer.concat([
      Buffer.from('demo/'),
      Buffer.from([0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80]),
    ]);

    expect(permittedSubclasses(classFile('demo/Shape', [nul, pair]))).toEqual([
      'demo.Shape -> demo.a\u0000b',
      'demo.Shape -> demo.\u{1f600}',
    ]);
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

    runPermits({ classDirectories: [outputDirectory], reportDir: root });

    expect(readFileSync(path.join(root, 'permits.txt'), 'utf8')).toBe(
      'demo.Animal -> demo.Cat\ndemo.Shape -> demo.Circle\n',
    );
  });

  it('skips truncated and non-class files instead of failing', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-permits-'));
    roots.push(root);
    const outputDirectory = path.join(root, 'classes');
    mkdirSync(path.join(outputDirectory, 'demo'), { recursive: true });
    const valid = classFile('demo/Shape', ['demo/Circle']);
    writeFileSync(path.join(outputDirectory, 'demo/Shape.class'), valid);
    writeFileSync(path.join(outputDirectory, 'demo/Cut.class'), valid.subarray(0, 40));
    writeFileSync(path.join(outputDirectory, 'demo/Text.class'), 'this is not a class file at all');
    writeFileSync(path.join(outputDirectory, 'demo/Empty.class'), '');

    runPermits({ classDirectories: [outputDirectory], reportDir: root });

    expect(readFileSync(path.join(root, 'permits.txt'), 'utf8')).toBe(
      'demo.Shape -> demo.Circle\n',
    );
  });

  it('writes an empty report when the module has no classes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-permits-'));
    roots.push(root);

    runPermits({ classDirectories: [path.join(root, 'missing')], reportDir: root });

    expect(readFileSync(path.join(root, 'permits.txt'), 'utf8')).toBe('');
  });
});
