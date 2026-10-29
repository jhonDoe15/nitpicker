import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { springViews } from '../../view/spring-view.mjs';
import { bindingIndex } from './bindings.mjs';

const FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../../../fixtures/kotlin-spring-facts.json',
);
const { files } = JSON.parse(readFileSync(FIXTURE, 'utf8'));

function factsOf(name) {
  return files.find(({ file }) => file.endsWith(name));
}

const bad = factsOf('shop/bad/Requests.kt');
const good = factsOf('shop/good/Requests.kt');

function argumentReads(facts, line, name = 'getForObject') {
  return facts.invocations.find((call) => call.line === line && call.name === name).arguments[0]
    .reads;
}

describe('the reads kotlin-psi records for request values', () => {
  it('reads names from the syntax tree, not from clipped text', () => {
    expect(argumentReads(bad, 46)[0]).toEqual({
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
    expect(bad.returnValues.find(({ line }) => line === 152).reads).toEqual([
      { name: 'request', member: 'getParameter', prefixes: ['redirect:'] },
    ]);
    expect(bad.returnValues.find(({ line }) => line === 20).reads).toEqual([
      { name: 'template', member: 'getForObject' },
      { name: 'address', calls: ['getForObject'] },
    ]);
  });

  it('ties a scope function to its source and its result to the call', () => {
    const scope = bad.scopes.find(({ host, line }) => host === 'let' && line === 31);
    expect(scope.reads).toEqual([{ name: 'url', member: 'let' }]);
    expect(bad.returnValues.filter(({ scope: id }) => id === scope.id)).toEqual([
      { line: 31, scope: scope.id, lambda: true, reads: [{ name: 'it', prefixes: ['https://'] }] },
    ]);
    expect(bad.locals.find(({ name }) => name === 'built').reads).toEqual([{ lambda: scope.id }]);
  });

  it('records where a local or property value comes from', () => {
    expect(bad.locals.find(({ name, line }) => name === 'client' && line === 109).origin).toEqual({
      root: 'RestClient',
      call: 'build',
    });
    expect(bad.properties.find(({ name }) => name === 'rest').origin).toEqual({
      root: 'RestClient',
      call: 'create',
    });
    expect(
      bad.properties.find(({ name, owner }) => name === 'target' && owner === 'Hook').reads,
    ).toEqual([{ name: 'endpoint' }]);
  });

  it('records the reads of a receiver, an assignment and each destructured entry', () => {
    const extension = bad.invocations.find(({ name }) => name === 'fetchAsTarget');
    expect(extension.receiverReads).toEqual([{ name: 'url', member: 'fetchAsTarget' }]);
    const appended = bad.invocations.find(({ name }) => name === 'plusAssign');
    expect(appended.arguments[0].reads).toEqual([{ name: 'url' }]);
    expect(
      bad.locals.filter(({ component }) => component !== undefined).map(({ reads }) => reads),
    ).toEqual([[{ name: 'url', member: 'split' }], [{ name: 'url', member: 'split' }]]);
  });

  it('leaves out what does not carry a value: conditions, when subjects and lookup keys', () => {
    const chosen = good.locals.find(({ name, line }) => name === 'target' && line < 50);
    expect(chosen.reads).toBeUndefined();
    const looked = good.returnValues.find(({ reads }) => reads?.[0]?.name === 'ALLOWED');
    expect(looked.reads).toEqual([{ name: 'ALLOWED', member: 'get', prefixes: ['redirect:'] }]);
  });
});

describe('bindingIndex on the recorded reads', () => {
  const views = springViews({ files, projectFiles: files, projectRoot: '/project' });
  const viewOf = (name) => views.find(({ file }) => file.file.endsWith(name));

  function resolve(name, line, callName = 'getForObject') {
    const view = viewOf(name);
    const call = view.file.invocations.find(
      (found) => found.line === line && found.name === callName,
    );
    const index = bindingIndex(view);
    return call.arguments[0].reads.map((read) => index.resolve(read, call.scope, { line }));
  }

  it('binds a shadowing lambda parameter and an inner local, not the function parameter', () => {
    const lambda = viewOf('good/Requests.kt').file.scopes.find(({ host }) => host === 'map');
    expect(resolve('good/Requests.kt', 16)[1]).toEqual({
      node: `${String(lambda.id)}:url`,
      member: undefined,
    });
    const local = viewOf('good/Requests.kt').file.locals.find(({ line }) => line === 20);
    expect(resolve('good/Requests.kt', 21)).toEqual([
      { node: `${String(local.scope)}:url@20`, member: undefined },
    ]);
  });

  it('binds it, a named lambda parameter and the receiver of run and with to their lambda', () => {
    const scopes = viewOf('bad/Requests.kt').file.scopes.filter(
      ({ line }) => line >= 24 && line <= 27,
    );
    expect([24, 25, 26, 27].map((line) => resolve('bad/Requests.kt', line)[0].node)).toEqual([
      `${String(scopes[0].id)}:it`,
      `${String(scopes[1].id)}:target`,
      `${String(scopes[2].id)}:this`,
      `${String(scopes[3].id)}:this`,
    ]);
  });

  it('binds a name in a class body to the class parameter and a property read to the property', () => {
    const view = viewOf('bad/Requests.kt');
    const hook = view.file.scopes.find(({ qualified }) => qualified === 'Hook');
    const index = bindingIndex(view);
    expect(index.resolve({ name: 'endpoint' }, hook.id, { line: 68 })).toEqual({
      node: `${String(hook.id)}:endpoint`,
      member: undefined,
    });
    expect(resolve('bad/Requests.kt', 70, 'uri')).toEqual([
      { node: `${String(hook.id)}:target`, member: undefined },
    ]);
  });
});
