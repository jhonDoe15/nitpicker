import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { kotlinDesignFindings } from './kotlin-design.mjs';

const RECORDED = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../fixtures/kotlin-design/design-facts.json'),
    'utf8',
  ),
);
const SHOP = 'src/shop';
const roots = [];

afterAll(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function findingsWith(protocols) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-scopes-'));
  roots.push(root);
  const reportRoot = path.join(root, 'build/nitpicker');
  mkdirSync(reportRoot, { recursive: true });
  writeFileSync(
    path.join(reportRoot, 'kotlin-facts.json'),
    JSON.stringify({ files: [], design: RECORDED }),
  );
  const policy = path.join(root, 'policy.json');
  writeFileSync(policy, JSON.stringify({ protocols }));
  return kotlinDesignFindings(reportRoot, { environment: { NITPICKER_POLICY: policy } });
}

function identities(findings, rule, file) {
  return findings
    .filter((finding) => finding.rule === rule && finding.path === `${SHOP}/${file}`)
    .map(({ identity }) => identity.replace(/^src\/shop\/\w+\.kt#/u, ''));
}

function callable(file, name) {
  return RECORDED.callables.find(({ id }) => id === `${SHOP}/${file}#${name}`);
}

function typeOf(file, name) {
  return RECORDED.types.find(({ id }) => id === `${SHOP}/${file}#${name}`);
}

function calls(file, name) {
  return callable(file, name).calls.map(
    ({ target, receiver, cleanup, branch }) =>
      `${target.slice(target.indexOf('#') + 1)} ${receiver} ${cleanup === true} ${(branch ?? []).join()}`,
  );
}

describe('the visibility of members in the recorded facts', () => {
  it.each([
    ['Base.hook', false],
    ['Base.inner', true],
    ['Base.visible', true],
  ])('exports %s: %s', (name, exported) => {
    expect(callable('Visibility.kt', name).exported).toEqual(exported);
  });

  it('lists a protected property as private and an internal one as visible', () => {
    expect(typeOf('Visibility.kt', 'Base').fields).toEqual([
      { name: 'shared', mutable: true, private: true },
      { name: 'inside', mutable: true },
    ]);
  });

  it.each([['Shape.sides:get'], ['Shape.label:get'], ['Named.title:get']])(
    'lists the abstract or interface property as an accessor without a body: %s',
    (name) => {
      const { kind, calls: found, exported } = callable('Visibility.kt', name);

      expect([kind, found, exported]).toEqual(['accessor', undefined, true]);
    },
  );
});

describe('the entries of the recorded facts', () => {
  it.each([
    ['Impl.handle', true],
    ['Framework.run', true],
    ['Framework.helper', undefined],
    ['Failure.detail', undefined],
    ['Controller.index', true],
    ['main', true],
  ])('mark %s as an entry: %s', (name, entry) => {
    expect(callable('Entries.kt', name).entry).toEqual(entry);
  });

  it('target the implementation that a call on its own type reaches', () => {
    expect(calls('Entries.kt', 'main')).toEqual(['Impl.handle undefined false ']);
  });
});

describe('the supertypes of a type in the recorded facts', () => {
  it.each([
    ['Entries.kt', 'Impl', [`${SHOP}/Entries.kt#Handler`]],
    ['Hierarchy.kt', 'Resource', undefined],
    ['Hierarchy.kt', 'FileRes', [`${SHOP}/Hierarchy.kt#Resource`]],
    ['Hierarchy.kt', 'Pg', [`${SHOP}/Hierarchy.kt#Conn`]],
    ['Entries.kt', 'Framework', undefined],
  ])('are the project types that %s %s extends or implements', (file, name, supertypes) => {
    expect(typeOf(file, name).supertypes).toEqual(supertypes);
  });
});

describe('the protocol contracts over a hierarchy in the recorded facts', () => {
  const findings = findingsWith([
    { type: 'Resource', open: ['open'], close: ['close'] },
    { type: 'Conn', open: ['open'], close: ['close'] },
  ]);

  it('match the open of a base class with the close of its override, and a contract on an interface', () => {
    expect(identities(findings, 'protocol-contract', 'Hierarchy.kt')).toEqual([
      'leakFile|f|unclosed:open',
      'leakPg|pg|unclosed:open',
    ]);
  });
});

describe('the calls inside receiver lambdas and branches in the recorded facts', () => {
  it.each([
    ['exclusive', ['Tx.step t false 0:then', 'Tx.open t false 0:else']],
    ['chosen', ['Tx.step t false 0:0', 'Tx.open t false 0:1']],
    ['sequential', ['Tx.step t false 0:then', 'Tx.open t false ']],
    ['lambdaInFinally', ['Tx.open r false ', 'Tx.step r false ', 'Tx.close r false ']],
    ['scopeInFinally', ['Tx.open t false ', 'Tx.step t false ', 'Tx.close t true ']],
    ['receiverBlock', ['Tx.open t false ', 'Tx.step t false ']],
    ['receiverRun', ['Tx.open t false ']],
    ['unknownReceiver', ['Tx.open t false ']],
    ['twoLambdas', ['Tx.open it@1 false ', 'Tx.step it@2 false ']],
    ['typedLambda', ['Tx.open item false ']],
    ['scoped', ['Tx.open a false ', 'Tx.step b false ']],
  ])('are keyed, marked and cleaned up in %s', (name, expected) => {
    expect(calls('Scopes.kt', name)).toEqual(expected);
  });

  it('find the lifecycle problems of a contract with steps, and none for exclusive branches', () => {
    const found = findingsWith([{ type: 'Tx', open: ['open'], close: ['close'], steps: ['step'] }]);

    expect(identities(found, 'protocol-contract', 'Scopes.kt')).toEqual([
      'chosen|t|unclosed:open',
      'exclusive|t|unclosed:open',
      'lambdaInFinally|r|unclosed:open',
      'receiverBlock|t|unclosed:open',
      'receiverRun|t|unclosed:open',
      'scoped|a|unclosed:open',
      'sequential|t|early:step',
      'sequential|t|unclosed:open',
      'twoLambdas|it@1|unclosed:open',
      'typedLambda|item|unclosed:open',
      'unknownReceiver|t|unclosed:open',
    ]);
  });
});

describe('the mutable state in the recorded facts', () => {
  it('lists the fields that hold a mutable collection, however it is created or reassigned', () => {
    expect(typeOf('Stores.kt', 'Stores').fields).toEqual([
      { name: 'given', mutable: true },
      { name: 'plain' },
      { name: 'reused', mutable: true, private: true },
      { name: 'swapped', mutable: true, private: true },
      { name: 'mixed', private: true },
      { name: 'built', mutable: true, private: true },
      { name: 'copied', mutable: true, private: true },
      { name: 'aliased', mutable: true, private: true },
      { name: 'picked', mutable: true, private: true },
      { name: 'lazily', mutable: true },
    ]);
  });

  it.each([
    ['Stores.reuse', 'reused'],
    ['Stores.mixedList', 'mixed'],
    ['Stores.pick', 'picked'],
    ['Stores.byWhen', 'picked'],
    ['Stores.locked', 'picked'],
    ['Stores.lazily:get', 'lazily'],
    ['Buf.text', 'text'],
  ])('names the field that %s returns', (name, field) => {
    expect(callable('Stores.kt', name).returnsField).toEqual(field);
  });

  it('reports the changes made through scope functions, Collections and StringBuilder methods', () => {
    const found = findingsWith([]);

    expect(identities(found, 'mutable-state-escape', 'Changes.kt')).toEqual([
      'builderChange>src/shop/Stores.kt#Buf.text:appendLine',
      'builderChange>src/shop/Stores.kt#Buf.text:setLength',
      'helperChange>src/shop/Stores.kt#Stores.aliasedList:reverse',
      'helperChange>src/shop/Stores.kt#Stores.reuse:sort',
      'scopeChange>src/shop/Stores.kt#Stores.builtList:clear',
      'scopeChange>src/shop/Stores.kt#Stores.copiedList:removeAt',
      'scopeChange>src/shop/Stores.kt#Stores.reuse:add',
    ]);
  });
});
