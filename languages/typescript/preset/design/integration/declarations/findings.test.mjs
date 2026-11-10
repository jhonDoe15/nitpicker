import { describe, expect, it } from 'vitest';
import { findingsOfFiles } from '../../test-support/project.mjs';

function identities(findings, rule) {
  return findings.filter((finding) => finding.rule === rule).map(({ identity }) => identity);
}

const CART = [
  'export class Cart {',
  '  private items: string[] = [];',
  '  list(): string[] { return this.items; }',
  '}',
  '',
].join('\n');

function useCart(padding) {
  return `import { Cart } from './cart';\n${padding}[1].forEach(() => {\n  new Cart().list().push('x');\n});\n`;
}

describe('the findings that name a callback', () => {
  it('keep their identity when lines are inserted above the callback', () => {
    const before = findingsOfFiles({ 'src/cart.ts': CART, 'src/use.ts': useCart('') });
    const after = findingsOfFiles({ 'src/cart.ts': CART, 'src/use.ts': useCart('\n\n// moved\n') });

    expect(identities(before, 'mutable-state-escape')).toEqual([
      'src/use.ts#forEach@1>src/cart.ts#Cart.list:push',
    ]);
    expect(identities(after, 'mutable-state-escape')).toEqual(
      identities(before, 'mutable-state-escape'),
    );
  });
});

describe('the caller-protocol rule', () => {
  const files = {
    'src/builder.ts': [
      'export class Builder {',
      '  first(): Builder { return this; }',
      '  second(): Builder { return this; }',
      "  build(): string { return ''; }",
      '}',
      '',
    ].join('\n'),
  };
  for (const name of ['one', 'two', 'three']) {
    files[`src/${name}/use.ts`] =
      `import { Builder } from '../builder';\nexport function ${name}(b: Builder): string {\n  b.first();\n  b.second();\n  return b.build();\n}\n`;
  }

  it('leaves out a chain on a class whose steps return the class itself', () => {
    expect(identities(findingsOfFiles(files), 'caller-protocol')).toEqual([]);
  });
});

describe('a protocols contract on an interface or abstract class', () => {
  const policy = (type) => ({
    protocols: [{ type, open: ['begin'], close: ['commit'], steps: ['write'] }],
  });
  const files = {
    'src/conn.ts': [
      'export interface Conn { begin(): void; write(text: string): void; commit(): void; }',
      'export class Impl implements Conn { begin() {} write(text: string) { void text; } commit() {} }',
      'export abstract class Base { abstract begin(): void; abstract commit(): void; }',
      'export class Sub extends Base { begin() {} commit() {} }',
      '',
    ].join('\n'),
    'src/leaky.ts': [
      "import { Base, Conn } from './conn';",
      'export function viaInterface(conn: Conn) { conn.begin(); }',
      'export function viaAbstract(base: Base) { base.begin(); }',
      '',
    ].join('\n'),
    'src/safe.ts': [
      "import { Base, Conn } from './conn';",
      'export function viaInterface(conn: Conn) {',
      '  conn.begin();',
      "  try { conn.write('x'); } finally { conn.commit(); }",
      '}',
      'export function viaAbstract(base: Base) {',
      '  base.begin();',
      '  try { base.commit(); } finally { base.commit(); }',
      '}',
      '',
    ].join('\n'),
  };

  it('fires for an open that is never closed through an interface receiver', () => {
    expect(identities(findingsOfFiles(files, policy('Conn')), 'protocol-contract')).toEqual([
      'src/leaky.ts#viaInterface|conn|unclosed:begin',
    ]);
  });

  it('fires for an open that is never closed through an abstract class receiver', () => {
    expect(identities(findingsOfFiles(files, policy('Base')), 'protocol-contract')).toEqual([
      'src/leaky.ts#viaAbstract|base|unclosed:begin',
    ]);
  });
});

describe('the mutable-state-escape rule', () => {
  const owner = (member) =>
    `export class Cart {\n  private store: string[] = [];\n  ${member}\n}\n`;
  const mutate = (access) =>
    `import { Cart } from './cart';\nexport function add(cart: Cart) {\n  ${access}\n}\n`;

  it('fires for a mutation through an accessor that returns a private collection', () => {
    const files = {
      'src/cart.ts': owner('get items(): string[] { return this.store; }'),
      'src/use.ts': mutate("cart.items.push('x');"),
    };

    expect(identities(findingsOfFiles(files), 'mutable-state-escape')).toEqual([
      'src/use.ts#add>src/cart.ts#Cart.items:push',
    ]);
  });

  it('fires for a mutation of a protected collection that a public member returns', () => {
    const files = {
      'src/cart.ts':
        'export class Cart {\n  protected store: string[] = [];\n  lines(): string[] { return this.store; }\n}\n',
      'src/use.ts': mutate("cart.lines().push('x');"),
    };

    expect(identities(findingsOfFiles(files), 'mutable-state-escape')).toEqual([
      'src/use.ts#add>src/cart.ts#Cart.lines:push',
    ]);
  });

  it('does not fire for a plain read of such an accessor', () => {
    const files = {
      'src/cart.ts': owner('get items(): string[] { return this.store; }'),
      'src/use.ts': mutate('return cart.items.length;'),
    };

    expect(identities(findingsOfFiles(files), 'mutable-state-escape')).toEqual([]);
  });

  const subclass = (modifier) => ({
    'src/cart.ts': owner(`${modifier} items(): string[] { return this.store; }`),
    'src/sub.ts':
      "import { Cart } from './cart';\nexport class Sub extends Cart {\n  add(x: string) {\n    this.items().push(x);\n  }\n}\n",
  });

  it('does not fire for a subclass that mutates a protected collection', () => {
    expect(identities(findingsOfFiles(subclass('protected')), 'mutable-state-escape')).toEqual([]);
  });

  it('fires for a subclass that mutates a public collection', () => {
    expect(identities(findingsOfFiles(subclass('public')), 'mutable-state-escape')).toEqual([
      'src/sub.ts#Sub.add>src/cart.ts#Cart.items:push',
    ]);
  });
});

describe('a close inside a callback in a finally block', () => {
  const files = {
    'src/conn.ts': 'export class Conn {\n  begin(): void {}\n  commit(): void {}\n}\n',
    'src/use.ts': [
      "import { Conn } from './conn';",
      'export function run(conn: Conn) {',
      '  conn.begin();',
      '  try { void 1; } finally { setTimeout(() => conn.commit(), 0); }',
      '}',
      '',
    ].join('\n'),
  };

  it('does not close the open of the function around it', () => {
    const policy = { protocols: [{ type: 'Conn', open: ['begin'], close: ['commit'] }] };

    expect(identities(findingsOfFiles(files, policy), 'protocol-contract')).toEqual([
      'src/use.ts#run|conn|unclosed:begin',
    ]);
  });
});

describe('a protocols contract across a class hierarchy and conditionals', () => {
  const policy = {
    protocols: [{ type: 'Res', open: ['open'], close: ['close'], steps: ['write'] }],
  };
  const files = {
    'src/res.ts': [
      'export abstract class Res {',
      '  open(): void {}',
      '  write(text: string): void { void text; }',
      '  abstract close(): void;',
      '}',
      'export class FileRes extends Res { close(): void {} }',
      '',
    ].join('\n'),
    'src/use.ts': [
      "import { FileRes } from './res';",
      'export function closed(f: FileRes) {',
      '  f.open();',
      '  try { void 1; } finally { f.close(); }',
      '}',
      'export function leaked(f: FileRes) { f.open(); }',
      'export function either(f: FileRes, early: boolean) {',
      "  if (early) { f.write('x'); } else { f.open(); }",
      '  try { void 1; } finally { f.close(); }',
      '}',
      'export function before(f: FileRes, early: boolean) {',
      "  if (early) { f.write('x'); }",
      '  f.open();',
      '  try { void 1; } finally { f.close(); }',
      '}',
      '',
    ].join('\n'),
  };

  it('matches an inherited open and an overriding close, and skips a step on the other arm', () => {
    expect(identities(findingsOfFiles(files, policy), 'protocol-contract')).toEqual([
      'src/use.ts#before|f|early:write',
      'src/use.ts#leaked|f|unclosed:open',
    ]);
  });
});
