import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { u16, utf8 } from '../test-support/class-constants.mts';
import { copyJavaClasses, sourceFileOf } from './java-classes.mts';

const trees = temporaryTrees('nitpicker-kotlin-classes-');

function classFile({
  sourceFile,
  withMember = true,
}: {
  readonly sourceFile?: string;
  readonly withMember?: boolean;
}): Buffer {
  const constants = [
    utf8('demo/Sample'),
    Buffer.concat([Buffer.from([7]), u16(1)]),
    Buffer.concat([Buffer.from([5]), Buffer.alloc(8)]),
    utf8('SourceFile'),
    utf8(sourceFile ?? 'unused'),
    utf8('field'),
    utf8('I'),
  ];
  const slots = 1 + 1 + 1 + 2 + 1 + 1 + 1;
  const field = u16(0, 7, 8, 0);
  return Buffer.concat([
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
    u16(0, 65, slots + 1),
    ...constants,
    u16(0x21, 2, 0, 0),
    withMember ? u16(1) : u16(0),
    ...(withMember ? [field] : []),
    u16(0),
    sourceFile === undefined
      ? u16(0)
      : Buffer.concat([u16(1), u16(5), Buffer.from([0, 0, 0, 2]), u16(6)]),
  ]);
}

function tree(files: Readonly<Record<string, string | Buffer>>): string {
  return trees.tree(files);
}

afterEach(trees.cleanup);

describe('sourceFileOf', () => {
  it('reads the SourceFile attribute of a class file, with and without members', () => {
    expect(sourceFileOf(classFile({ sourceFile: 'Greeter.java' }))).toBe('Greeter.java');
    expect(sourceFileOf(classFile({ sourceFile: 'Greeter.kt', withMember: false }))).toBe(
      'Greeter.kt',
    );
  });

  it('is undefined without the attribute or for something that is not a class file', () => {
    expect(sourceFileOf(classFile({}))).toBeUndefined();
    expect(sourceFileOf(Buffer.from('not a class'))).toBeUndefined();
  });
});

describe('copyJavaClasses', () => {
  it('copies the classes compiled from Java sources, with or without debug information, keeping their directories', () => {
    const root = tree({
      'classes/demo/Bridge.class': classFile({ sourceFile: 'Bridge.java' }),
      'classes/demo/Bridge$Inner.class': classFile({ sourceFile: 'Bridge.java' }),
      'classes/demo/Plain.class': classFile({}),
      'classes/demo/Greeter.class': classFile({ sourceFile: 'Greeter.kt' }),
      'classes/demo/notes.txt': 'text',
    });
    const target = path.join(root, 'java-classes');

    const copied = copyJavaClasses(path.join(root, 'classes'), target);

    expect(copied.map((file) => path.relative(path.join(root, 'classes'), file)).sort()).toEqual([
      'demo/Bridge$Inner.class',
      'demo/Bridge.class',
      'demo/Plain.class',
    ]);
    expect(readdirSync(path.join(target, 'demo')).sort()).toEqual([
      'Bridge$Inner.class',
      'Bridge.class',
      'Plain.class',
    ]);
  });

  it('names the class file it cannot read', () => {
    const broken = classFile({ sourceFile: 'Broken.java' });
    broken[10] = 99;
    const root = tree({ 'classes/demo/Broken.class': broken });
    const file = path.join(root, 'classes/demo/Broken.class');

    expect(() => copyJavaClasses(path.join(root, 'classes'), path.join(root, 'out'))).toThrow(
      new Error(`nitpicker cannot read the class file ${file}: unknown constant pool tag 99`),
    );
  });

  it('leaves nothing behind for a missing class directory', () => {
    const root = tree({ 'stale/Old.class': classFile({ sourceFile: 'Old.java' }) });

    expect(copyJavaClasses(path.join(root, 'none'), path.join(root, 'stale'))).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });
});
