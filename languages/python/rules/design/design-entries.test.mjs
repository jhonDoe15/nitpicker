import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../metrics/python-helpers.mjs';
import { designFacts, factsById } from './test-support/design-harness.mjs';

const WEB = 'app/web.py';

describe.skipIf(!pythonUsable())('the Python design producer entries', () => {
  const byId = factsById(designFacts('entries'));

  it.each([
    ['a function decorated by a framework', `${WEB}#orders_view`],
    ['main in a module with a main guard', `${WEB}#main`],
    ['main in a __main__ module', 'app/__main__.py#main'],
    ['a function the main guard calls', `${WEB}#called_from_main_block`],
    ['a function registered with atexit', `${WEB}#on_exit`],
    ['a function passed as a thread target', `${WEB}#worker_target`],
    ['an implementation of an abstract method', `${WEB}#OrderHandler.handle`],
    ['an override of a project method', `${WEB}#OrderHandler.describe`],
    ['an override of a framework base method', `${WEB}#Encoder.default`],
    ['a unittest fixture method', `${WEB}#Cases.setUp`],
    ['a unittest test method', `${WEB}#Cases.test_value`],
    ['a dunder method', `${WEB}#Machine.__call__`],
    ['another dunder method', `${WEB}#Machine.__len__`],
    ['a method decorated by a framework', `${WEB}#Machine.endpoint`],
  ])('marks %s as an entry', (_label, id) => {
    expect(byId.callable(id).entry).toBe(true);
  });

  it.each([
    ['a function only passed to a project function that registers it', `${WEB}#tick`],
    ['a function never referenced', `${WEB}#not_registered`],
    ['a function passed to a builtin or called by main', `${WEB}#plain_helper`],
    ['a cached function', `${WEB}#cached_total`],
    ['a context manager function', `${WEB}#scoped`],
    ['a helper next to an overriding method', `${WEB}#OrderHandler.helper`],
    ['a method next to framework overrides', `${WEB}#Encoder.other`],
    ['a helper method of a test case', `${WEB}#Cases.helper`],
    ['a constructor', `${WEB}#Machine.__init__`],
    ['a property', `${WEB}#Machine.size`],
    ['a static method', `${WEB}#Machine.make`],
    ['a class method', `${WEB}#Machine.build`],
    ['a regular method', `${WEB}#Machine.regular`],
    ['a helper next to main in a __main__ module', 'app/__main__.py#helper'],
    ['a method that overrides nothing', 'app/base.py#Handler.describe'],
    ['an abstract method', 'app/base.py#Handler.handle'],
    ['a decorator factory', 'app/registry.py#route'],
  ])('does not mark %s as an entry', (_label, id) => {
    expect(byId.callable(id).entry).toBeUndefined();
  });
});

describe.skipIf(!pythonUsable())('the Python design producer modules and roles', () => {
  it('marks the files a script or __main__ module loads and splits tests from production', () => {
    expect(designFacts('entries').modules).toEqual([
      { file: 'app/__main__.py', role: 'production', entry: true },
      { file: 'app/base.py', role: 'production' },
      { file: 'app/registry.py', role: 'production' },
      { file: 'app/web.py', role: 'production', entry: true },
    ]);
  });

  it('lists test files and conftest helpers as test modules without types or callables', () => {
    const facts = designFacts('roles');

    expect(facts.modules).toEqual([
      { file: 'conftest.py', role: 'test' },
      { file: 'core.py', role: 'production' },
      { file: 'job.py', role: 'production' },
      { file: 'serve.py', role: 'production', entry: true },
      { file: 'tests/test_core.py', role: 'test' },
    ]);
    expect(facts.types.map((entry) => entry.id)).toEqual([
      'core.py',
      'core.py#Engine',
      'job.py',
      'serve.py',
    ]);
    expect(facts.callables.map((entry) => entry.id)).toEqual([
      'core.py#Engine.start',
      'job.py#main',
      'serve.py#run',
    ]);
  });

  it('skips a file that does not parse', () => {
    const files = designFacts('roles').modules.map((entry) => entry.file);

    expect(files).not.toContain('broken.py');
  });

  it('treats main as an entry when the project declares its file an entry file', () => {
    const plain = factsById(designFacts('roles')).callable('job.py#main');
    const declared = designFacts('roles', { entryFiles: ['job.py'] });

    expect(plain.entry).toBeUndefined();
    expect(declared.modules.find((entry) => entry.file === 'job.py')).toEqual({
      file: 'job.py',
      role: 'production',
      entry: true,
    });
    expect(factsById(declared).callable('job.py#main').entry).toBe(true);
  });

  it('marks the function the main guard calls and keeps its callee a plain method', () => {
    const byId = factsById(designFacts('roles'));

    expect(byId.callable('serve.py#run').entry).toBe(true);
    expect(byId.callable('core.py#Engine.start').entry).toBeUndefined();
  });
});
