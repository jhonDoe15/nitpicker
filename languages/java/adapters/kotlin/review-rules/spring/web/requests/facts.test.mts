import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fieldOf, fieldsOf, listOf } from '../../../../../../../../shared/values/readers.mts';
import { fixtureFacts, type Loose } from '../../spring-test-facts.mts';
import { springViews as typedSpringViews } from '../../view/spring-view.mts';
import type { SpringView } from '../../typed/spring-shapes.mts';
import { bindingIndex } from './bindings.mts';

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../../fixtures/kotlin-spring-facts.json',
);
const files = fixtureFacts(FIXTURE);

function isSpringView(value: unknown): value is SpringView {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    'memo' in value &&
    'chain' in value
  );
}

function springViews(): SpringView[] {
  const found: unknown = Reflect.apply(typedSpringViews, undefined, [
    { files, projectFiles: files, projectRoot: '/project' },
  ]);
  return listOf(found).filter(isSpringView);
}

function factsOf(name: string): Loose {
  return files.find(({ file }) => typeof file === 'string' && file.endsWith(name)) ?? {};
}

function entriesOf(facts: Loose, key: string): Loose[] {
  return listOf(facts[key]).map(fieldsOf);
}

function entryOf(facts: Loose, key: string, matches: (entry: Loose) => boolean): Loose {
  return entriesOf(facts, key).find(matches) ?? {};
}

const bad = factsOf('shop/bad/RequestValues.kt');
const good = factsOf('shop/good/RequestValues.kt');

function argumentReads(facts: Loose, line: number, name = 'getForObject'): unknown {
  const call = entryOf(
    facts,
    'invocations',
    (found) => found['line'] === line && found['name'] === name,
  );
  return fieldOf(listOf(call['arguments'])[0], 'reads');
}

function returnValue(facts: Loose, line: number): Loose {
  return entryOf(facts, 'returnValues', (found) => found['line'] === line);
}

describe('the reads kotlin-psi records for request values', () => {
  it('reads names from the syntax tree, not from clipped text', () => {
    expect(listOf(argumentReads(bad, 46))[0]).toEqual({
      name: 'host',
      member: 'ifEmpty',
      prefixes: ['https://'],
    });
    expect(argumentReads(bad, 48)).toEqual([{ name: 'url' }]);
    expect(argumentReads(good, 25)).toEqual([{ name: 'BASE' }]);
    expect(argumentReads(good, 27)).toEqual([{ name: 'BASE' }]);
  });

  it('records the literal text before a read and the calls around it', () => {
    expect(argumentReads(bad, 152, 'getParameter')).toBeUndefined();
    expect(returnValue(bad, 152)['reads']).toEqual([
      { name: 'request', member: 'getParameter', prefixes: ['redirect:'] },
    ]);
    expect(returnValue(bad, 20)['reads']).toEqual([
      { name: 'template', member: 'getForObject' },
      { name: 'address', calls: ['getForObject'] },
    ]);
  });

  it('ties a scope function to its source and its result to the call', () => {
    const scope = entryOf(bad, 'scopes', ({ host, line }) => host === 'let' && line === 31);
    expect(scope['reads']).toEqual([{ name: 'url', member: 'let' }]);
    expect(entriesOf(bad, 'returnValues').filter(({ scope: id }) => id === scope['id'])).toEqual([
      {
        line: 31,
        scope: scope['id'],
        lambda: true,
        reads: [{ name: 'it', prefixes: ['https://'] }],
      },
    ]);
    expect(entryOf(bad, 'locals', ({ name }) => name === 'built')['reads']).toEqual([
      { lambda: scope['id'] },
    ]);
  });

  it('records where a local or property value comes from', () => {
    const client = entryOf(bad, 'locals', ({ name, line }) => name === 'client' && line === 109);
    expect(client['origin']).toEqual({ root: 'RestClient', call: 'build' });
    expect(entryOf(bad, 'properties', ({ name }) => name === 'rest')['origin']).toEqual({
      root: 'RestClient',
      call: 'create',
    });
    expect(
      entryOf(bad, 'properties', ({ name, owner }) => name === 'target' && owner === 'Hook')[
        'reads'
      ],
    ).toEqual([{ name: 'endpoint' }]);
  });

  it('records the reads of a receiver, an assignment and each destructured entry', () => {
    const extension = entryOf(bad, 'invocations', ({ name }) => name === 'fetchAsTarget');
    expect(extension['receiverReads']).toEqual([{ name: 'url', member: 'fetchAsTarget' }]);
    const appended = entryOf(bad, 'invocations', ({ name }) => name === 'plusAssign');
    expect(fieldOf(listOf(appended['arguments'])[0], 'reads')).toEqual([{ name: 'url' }]);
    expect(
      entriesOf(bad, 'locals')
        .filter(({ component }) => component !== undefined)
        .map(({ reads }) => reads),
    ).toEqual([[{ name: 'url', member: 'split' }], [{ name: 'url', member: 'split' }]]);
  });

  it('leaves out what does not carry a value: conditions, when subjects and lookup keys', () => {
    const chosen = entryOf(
      good,
      'locals',
      ({ name, line }) => name === 'target' && typeof line === 'number' && line < 50,
    );
    expect(chosen['reads']).toBeUndefined();
    const looked = entryOf(
      good,
      'returnValues',
      ({ reads }) => fieldOf(listOf(reads)[0], 'name') === 'ALLOWED',
    );
    expect(looked['reads']).toEqual([{ name: 'ALLOWED', member: 'get', prefixes: ['redirect:'] }]);
  });
});

describe('bindingIndex on the recorded reads', () => {
  const views = springViews();

  function viewOf(name: string): SpringView {
    const found = views.find(({ file }) => file.file.endsWith(name));
    if (found === undefined) {
      throw new Error(`no view of ${name}`);
    }
    return found;
  }

  function resolve(name: string, line: number, callName = 'getForObject'): unknown[] {
    const view = viewOf(name);
    const call = view.file.invocations.find(
      (found) => found.line === line && found.name === callName,
    );
    if (call === undefined) {
      throw new Error(`no ${callName} call at line ${String(line)}`);
    }
    const index = bindingIndex(view);
    return (call.arguments[0]?.reads ?? []).map((read) =>
      index.resolve(read, call.scope, { line }),
    );
  }

  it('binds a shadowing lambda parameter and an inner local, not the function parameter', () => {
    const lambda = viewOf('good/RequestValues.kt').file.scopes.find(({ host }) => host === 'map');
    expect(resolve('good/RequestValues.kt', 16)[1]).toEqual({
      node: `${String(lambda?.id)}:url`,
      member: undefined,
    });
    const local = viewOf('good/RequestValues.kt').file.locals?.find(({ line }) => line === 20);
    expect(resolve('good/RequestValues.kt', 21)).toEqual([
      { node: `${String(local?.scope)}:url@20`, member: undefined },
    ]);
  });

  it('binds it, a named lambda parameter and the receiver of run and with to their lambda', () => {
    const scopes = viewOf('bad/RequestValues.kt').file.scopes.filter(
      ({ line }) => line >= 24 && line <= 27,
    );
    expect(
      [24, 25, 26, 27].map((line) => fieldOf(resolve('bad/RequestValues.kt', line)[0], 'node')),
    ).toEqual([
      `${String(scopes[0]?.id)}:it`,
      `${String(scopes[1]?.id)}:target`,
      `${String(scopes[2]?.id)}:this`,
      `${String(scopes[3]?.id)}:this`,
    ]);
  });

  it('binds a name in a class body to the class parameter and a property read to the property', () => {
    const view = viewOf('bad/RequestValues.kt');
    const hook = view.file.scopes.find(({ qualified }) => qualified === 'Hook');
    const index = bindingIndex(view);
    expect(index.resolve({ name: 'endpoint' }, hook?.id, { line: 68 })).toEqual({
      node: `${String(hook?.id)}:endpoint`,
      member: undefined,
    });
    expect(resolve('bad/RequestValues.kt', 70, 'uri')).toEqual([
      { node: `${String(hook?.id)}:target`, member: undefined },
    ]);
  });
});
