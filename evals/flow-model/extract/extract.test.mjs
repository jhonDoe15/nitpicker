import { describe, expect, it } from 'vitest';
import { fixtureNamed } from '../fixtures/index.mjs';
import { code } from '../fixtures/source.mjs';
import { nodesOf } from '../report/canonical.mjs';
import { extractModel } from './extract.mjs';
import { render } from './render.mjs';

const LOCAL_N = 'local:payOrder:n#1';

function modelOf(name) {
  const fixture = fixtureNamed(name);
  return extractModel({ file: fixture.file, text: fixture.source, entry: fixture.entry });
}

function nodes(model, kind) {
  return nodesOf(Object.values(model.functions).map((fn) => fn.body)).filter(
    (node) => node.kind === kind,
  );
}

describe('extractModel', () => {
  it('keeps guards, effects and completions with source line and column', () => {
    const model = modelOf('correct-ordering');
    const [guard] = nodes(model, 'if');
    const calls = nodes(model, 'call');

    expect(render(guard.test)).toBe('order.status !== "pending"');
    expect(guard.test.loc).toEqual({ line: 2, column: 7 });
    expect(calls.map((call) => [render(call), call.loc.line])).toEqual([
      ['db.commit(order, "paid")', 5],
      ['bus.publish("OrderPaid", order.id)', 6],
    ]);
    expect(nodes(model, 'return').map((item) => render(item.value))).toEqual([
      '"skipped"',
      '"paid"',
    ]);
  });

  it('resolves enum members and const object members to their literal values', () => {
    const enumGuard = nodes(modelOf('enum-guard'), 'if')[0].test;
    const [publish] = nodes(modelOf('const-object-event'), 'call').filter(
      (call) => call.callee.method === 'publish',
    );

    expect(enumGuard.right).toEqual({ kind: 'lit', value: 'pending', via: 'OrderStatus.Pending' });
    expect(publish.args[0]).toEqual({ kind: 'lit', value: 'OrderPaid', via: 'Events.Paid' });
  });

  it('binds local aliases by declaration, independent of their position', () => {
    const binds = nodes(modelOf('alias-entity'), 'bind');

    expect(binds.map((bind) => [bind.id, render(bind.value)])).toEqual([
      ['payOrder:target#1', 'order'],
      ['payOrder:id#2', 'target.id'],
      ['payOrder:status#3', 'target.status'],
    ]);
  });

  it('includes resolved same-file helpers and nothing else from the file', () => {
    const text = code`
      function settle(order, db) {
        db.commit(order, 'paid');
      }
      function unrelated() {
        return 1;
      }
      export function payOrder(order, db) {
        settle(order, db);
      }
    `;
    const model = extractModel({ file: 'helpers.ts', text, entry: 'payOrder' });

    expect(Object.keys(model.functions)).toEqual(['payOrder', 'settle']);
    expect(nodes(model, 'call')[0].callee).toEqual({ kind: 'helper', name: 'settle' });
  });

  it('resolves import aliases in .mjs sources through the allowJs program', () => {
    const text = code`
      import { resolveAnalyzerMetadata as resolve } from './run-analyzers.mjs';
      import * as fs from 'node:fs';
      export function load(analyzer, context, target) {
        resolve(analyzer, context);
        fs.renameSync(target, target);
      }
    `;
    const callees = nodes(extractModel({ file: 'load.mjs', text, entry: 'load' }), 'call').map(
      (call) => call.callee,
    );

    expect(callees).toEqual([
      { kind: 'import', module: './run-analyzers.mjs', name: 'resolveAnalyzerMetadata' },
      { kind: 'import', module: 'node:fs', name: 'renameSync' },
    ]);
  });

  it('maps destructured parameters to fields of the positional argument', () => {
    const text = code`
      export function write({ directory, target: file }) {
        return file;
      }
    `;
    const model = extractModel({ file: 'write.mjs', text, entry: 'write' });

    expect(model.functions.write.params).toEqual([
      { index: 0, name: 'arg0', fields: ['directory', 'file'], supported: true },
    ]);
    expect(render(nodes(model, 'return')[0].value)).toBe('arg0.target');
  });

  it('records loops, finally blocks and computed calls as unsupported instead of dropping them', () => {
    expect(nodes(modelOf('loop'), 'unsupported').map((item) => item.syntax)).toEqual(['loop']);
    expect(nodes(modelOf('finally-cleanup'), 'unsupported').map((item) => item.syntax)).toEqual([
      'finally',
    ]);
    expect(nodes(modelOf('unknown-dispatch'), 'call')[0].callee).toEqual({
      kind: 'dynamic',
      syntax: 'ElementAccessExpression',
    });
  });

  it.each([
    ['compound assignment', 'n += 1;', { syntax: 'compound-assignment', clobbers: [LOCAL_N] }],
    ['logical assignment', 'n ||= 1;', { syntax: 'compound-assignment', clobbers: [LOCAL_N] }],
    ['increment', 'n++;', { syntax: 'PostfixUnaryExpression', clobbers: [LOCAL_N] }],
    ['parameter decrement', '--order;', { syntax: 'prefix-operator', clobbers: ['param:0'] }],
    ['delete', 'delete order.status;', { syntax: 'DeleteExpression', clobbers: [] }],
    ['assignment expression', 'audit((n = 2));', { syntax: 'operator =', clobbers: [LOCAL_N] }],
  ])(
    'records a %s as an unsupported mutation with its clobbered bindings',
    (_name, line, expected) => {
      const text = `export function payOrder(order) {\n  let n = 0;\n  ${line}\n}\n`;
      const body = extractModel({ file: 'mutation.ts', text, entry: 'payOrder' }).functions.payOrder
        .body;
      const unsupported = nodesOf(body).filter((node) => node.kind === 'unsupported');

      expect(unsupported.map((node) => [node.syntax, node.mutates, node.clobbers])).toEqual([
        [expected.syntax, true, expected.clobbers],
      ]);
    },
  );

  it('records optional chains, await and null as unsupported', () => {
    const text = code`
      export async function payOrder(order, db) {
        db?.commit(order);
        await db.flush();
        return null;
      }
    `;
    const model = extractModel({ file: 'unsupported.ts', text, entry: 'payOrder' });

    expect([
      model.functions.payOrder.async,
      nodes(model, 'unsupported').map((node) => [node.syntax, node.hasCall]),
    ]).toEqual([
      true,
      [
        ['optional-chain', true],
        ['AwaitExpression', true],
        ['NullKeyword', false],
      ],
    ]);
  });

  it('names each call site by its function, its callee and its position among those calls', () => {
    const sites = nodes(modelOf('duplicate-publish-sites'), 'call').map((call) => call.site);

    expect(sites).toEqual(['payOrder:bus.publish#1', 'payOrder:bus.publish#2']);
  });

  it.each([
    ['a getter', 'get pending() { return "paid"; }'],
    ['a method', 'pending() { return "paid"; }'],
    ['a computed key', '[key]: "paid"'],
    ['a spread', '...base'],
  ])('does not inline members of an as-const object with %s', (_name, member) => {
    const text = code`
      const key = 'pending';
      const base = { pending: 'paid' };
      const Status = { pending: 'pending', ${member} } as const;
      export function payOrder(order) {
        return Status.pending;
      }
    `;
    const model = extractModel({ file: 'members.ts', text, entry: 'payOrder' });

    expect(render(nodes(model, 'return')[0].value)).toEqual('Status.pending');
  });

  it('resolves the constructor of new and keeps __proto__ out of object literals', () => {
    const text = code`
      import { Error as Imported } from './errors';
      export function payOrder(order) {
        const first = new Error('a');
        const second = new Imported('b');
        return { __proto__: order };
      }
    `;
    const model = extractModel({ file: 'resolve.ts', text, entry: 'payOrder' });

    expect([
      nodes(model, 'new').map((node) => [node.name, node.global]),
      nodes(model, 'unsupported').map((node) => node.syntax),
    ]).toEqual([
      [
        ['Error', true],
        ['Imported', false],
      ],
      ['object-member'],
    ]);
  });

  it('skips overload signatures and rejects a source that redeclares a binding', () => {
    const overloaded = code`
      function settle(order: unknown): void;
      function settle(order) {
        return order;
      }
      export function payOrder(order) {
        settle(order);
      }
    `;
    function extractRedeclared() {
      const text = 'export function payOrder(db) {\n  const db = 1;\n}\n';
      extractModel({ file: 'redeclared.ts', text, entry: 'payOrder' });
    }

    expect(
      Object.keys(
        extractModel({ file: 'overload.ts', text: overloaded, entry: 'payOrder' }).functions,
      ),
    ).toEqual(['payOrder', 'settle']);
    expect(extractRedeclared).toThrowError(
      new Error("flow-model: redeclared.ts is not valid source: Duplicate identifier 'db'."),
    );
  });

  it('fails clearly when the entry function does not exist', () => {
    function extractMissing() {
      extractModel({ file: 'empty.ts', text: 'export const x = 1;\n', entry: 'missing' });
    }

    expect(extractMissing).toThrowError(
      new Error('flow-model: entry function missing not found in empty.ts'),
    );
  });
});
