import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'service-locator-lookup';
const hit = (line, subject) => `${RULE}:${String(line)} ${subject}`;
const code = (...lines) => `${lines.join('\n')}\n`;

describe.skipIf(!enabled)('service-locator-lookup of the supported containers', () => {
  it('flags a lookup through each known container API', () => {
    const [actual, expected] = outcomes([
      [
        'injector get',
        code(
          'from injector import Injector',
          '',
          'injector = Injector()',
          '',
          '',
          'def run():',
          '    return injector.get(Mailer)',
        ),
        [hit(7, 'injector.Injector.get')],
      ],
      [
        'injector create_object through a module alias',
        code(
          'import injector as di',
          '',
          'locator = di.Injector()',
          '',
          '',
          'def run():',
          '    return locator.create_object(Mailer)',
        ),
        [hit(7, 'injector.Injector.create_object')],
      ],
      [
        'an Injector parameter',
        code(
          'from injector import Injector',
          '',
          '',
          'def run(injector: Injector):',
          '    return injector.get(Mailer)',
        ),
        [hit(5, 'injector.Injector.get')],
      ],
      [
        'an Injector kept on self',
        code(
          'from injector import Injector',
          '',
          '',
          'class Service:',
          '    def __init__(self, injector: Injector) -> None:',
          '        self.injector = injector',
          '',
          '    def run(self):',
          '        return self.injector.get(Mailer)',
        ),
        [hit(9, 'injector.Injector.get')],
      ],
      [
        'punq resolve and resolve_all',
        code(
          'import punq',
          '',
          'container = punq.Container()',
          '',
          '',
          'def run():',
          '    return container.resolve(Mailer), container.resolve_all(Mailer)',
        ),
        [hit(7, 'punq.Container.resolve'), hit(7, 'punq.Container.resolve_all')],
      ],
      [
        'lagom subscript and resolve',
        code(
          'from lagom import Container',
          '',
          'container = Container()',
          '',
          '',
          'def run():',
          '    return container[Mailer], container.resolve(Mailer)',
        ),
        [hit(7, 'lagom.Container.resolve'), hit(7, 'lagom.Container[...]')],
      ],
      [
        'kink subscript',
        code('from kink import di', '', '', 'def run():', '    return di[Mailer]'),
        [hit(5, 'kink.di[...]')],
      ],
      [
        'dependency_injector provider called on the class',
        code(
          'from dependency_injector import containers, providers',
          '',
          '',
          'class Container(containers.DeclarativeContainer):',
          '    mailer = providers.Factory(Mailer)',
          '',
          '',
          'def run():',
          '    return Container.mailer()',
        ),
        [hit(9, 'dependency_injector Container.mailer')],
      ],
      [
        'dependency_injector provider called on an instance',
        code(
          'from dependency_injector import containers, providers',
          '',
          '',
          'class Container(containers.DeclarativeContainer):',
          '    mailer = providers.Singleton(Mailer)',
          '',
          '',
          'container = Container()',
          '',
          '',
          'def run():',
          '    return container.mailer()',
        ),
        [hit(12, 'dependency_injector Container.mailer')],
      ],
      [
        'that_depends resolve and resolve_sync',
        code(
          'from that_depends import BaseContainer, providers',
          '',
          '',
          'class Container(BaseContainer):',
          '    mailer = providers.Factory(Mailer)',
          '',
          '',
          'async def run():',
          '    first = await Container.mailer.resolve()',
          '    return first, Container.mailer.resolve_sync()',
        ),
        [hit(9, 'that_depends Container.mailer'), hit(10, 'that_depends Container.mailer')],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('is not triggered by a method that is only named like a lookup', () => {
    const [actual, expected] = outcomes([
      ['a dict get', 'cache = {}\nvalue = cache.get("a")\n', []],
      [
        'a project class with get and resolve',
        code(
          'class Registry:',
          '    def get(self, key):',
          '        return key',
          '',
          '    def resolve(self, key):',
          '        return key',
          '',
          '',
          'registry = Registry()',
          'value = registry.get("a"), registry.resolve("b")',
        ),
        [],
      ],
      [
        'an Injector from an unknown library',
        code(
          'from toolbox import Injector',
          '',
          'injector = Injector()',
          'value = injector.get(Mailer)',
        ),
        [],
      ],
      [
        'a punq-like name that is not punq',
        code(
          'import punqx',
          '',
          'container = punqx.Container()',
          'value = container.resolve(Mailer)',
        ),
        [],
      ],
      ['a subscript of a plain object', code('registry = {}', 'value = registry[Mailer]'), []],
    ]);
    expect(actual).toEqual(expected);
  });

  it('allows registration, wiring and calls that are not service lookups', () => {
    const [actual, expected] = outcomes([
      [
        'lagom and kink registration',
        code(
          'from kink import di, inject',
          'from lagom import Container',
          '',
          'container = Container()',
          'container[Mailer] = Mailer()',
          'di[Mailer] = Mailer()',
          '',
          '',
          '@inject',
          'def run(mailer: Mailer) -> None:',
          '    mailer.send()',
        ),
        [],
      ],
      [
        'dependency_injector wiring with Provide',
        code(
          'from dependency_injector import containers, providers',
          'from dependency_injector.wiring import Provide, inject',
          '',
          '',
          'class Container(containers.DeclarativeContainer):',
          '    config = providers.Configuration()',
          '    mailer = providers.Factory(Mailer)',
          '',
          '',
          '@inject',
          'def run(mailer: Mailer = Provide[Container.mailer]) -> None:',
          '    mailer.send()',
          '',
          '',
          'def wire(container: Container) -> None:',
          '    container.wire(modules=[__name__])',
          '    container.config.api_key.from_env("API_KEY")',
        ),
        [],
      ],
      [
        'an injector Module and Provider',
        code(
          'from injector import Injector, Module, Provider, provider',
          '',
          '',
          'class MailModule(Module):',
          '    @provider',
          '    def mailer(self, injector: Injector) -> Mailer:',
          '        return injector.get(Mailer)',
          '',
          '',
          'class MailerProvider(Provider):',
          '    def get(self, injector: Injector) -> Mailer:',
          '        return injector.get(Mailer)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it.each([
    'main.py',
    'src/shop/main.py',
    'src/shop/__main__.py',
    'src/shop/composition_root.py',
    'src/shop/composition_root/wiring.py',
    'src/shop/server.py',
    'src/shop/settings.py',
    'manage.py',
  ])('allows a lookup in the composition root %s', (file) => {
    const body = code(
      'import punq',
      '',
      'container = punq.Container()',
      'mailer = container.resolve(Mailer)',
    );
    expect(findingsOf({ [file]: body })).toEqual([]);
  });

  it('exempts a listed entry and a test, and still flags a module beside an application factory', () => {
    const lookup = code(
      'import punq',
      '',
      'container = punq.Container()',
      'mailer = container.resolve(Mailer)',
    );
    const files = {
      'shop/__init__.py': code('def create_app():', '    return None'),
      'shop/db.py': lookup,
      'src/shop/jobs/run.py': lookup,
      'src/shop/other.py': lookup,
      'tests/test_mail.py': lookup,
    };
    expect(
      findingsOf(files, {
        sourceRoots: ['src'],
        entryPoints: ['src/shop/jobs/*.py'],
        testFiles: ['tests/test_mail.py'],
      }),
    ).toEqual([
      `${RULE} shop/db.py:4 punq.Container.resolve`,
      `${RULE} src/shop/other.py:4 punq.Container.resolve`,
    ]);
  });
});

describe.skipIf(!enabled)('service-locator-lookup behind project helpers', () => {
  const SHARED = code(
    'import punq',
    '',
    'container = punq.Container()',
    '',
    '',
    'def resolve_mailer():',
    '    return container.resolve(Mailer)',
  );
  const LOOKUP_IN_SHARED = `${RULE} src/shop/shared.py:7 punq.Container.resolve`;
  const wrapped = (file, line, name, helper = 'shared.py') =>
    `${RULE} src/shop/${file}:${String(line)} ${name} via punq.Container.resolve in src/shop/${helper}`;
  const run = (files) =>
    findingsOf({ 'src/shop/shared.py': SHARED, ...files }, { sourceRoots: ['src'] });

  it('flags the call of a helper whose body looks a service up, and the lookup itself', () => {
    const files = {
      'src/shop/orders.py': code(
        'from shop.shared import resolve_mailer',
        '',
        '',
        'def confirm():',
        '    resolve_mailer().send()',
      ),
    };
    expect(run(files)).toEqual(
      [wrapped('orders.py', 5, 'resolve_mailer'), LOOKUP_IN_SHARED].sort(),
    );
  });

  it('follows a module import, an import alias and a re-export from a package', () => {
    const files = {
      'src/shop/__init__.py': 'from shop.shared import resolve_mailer\n',
      'src/shop/by_module.py': code(
        'from shop import shared',
        '',
        '',
        'def confirm():',
        '    shared.resolve_mailer().send()',
      ),
      'src/shop/by_alias.py': code(
        'from shop.shared import resolve_mailer as get_mailer',
        '',
        '',
        'def confirm():',
        '    get_mailer().send()',
      ),
      'src/shop/by_package.py': code(
        'from shop import resolve_mailer',
        '',
        '',
        'def confirm():',
        '    resolve_mailer().send()',
      ),
    };
    expect(run(files)).toEqual(
      [
        wrapped('by_module.py', 5, 'resolve_mailer'),
        wrapped('by_alias.py', 5, 'get_mailer'),
        wrapped('by_package.py', 5, 'resolve_mailer'),
        LOOKUP_IN_SHARED,
      ].sort(),
    );
  });

  it('follows a helper of a helper', () => {
    const files = {
      'src/shop/mailing.py': code(
        'from shop.shared import resolve_mailer',
        '',
        '',
        'def mailer_of_the_day():',
        '    return resolve_mailer()',
      ),
      'src/shop/orders.py': code(
        'from shop.mailing import mailer_of_the_day',
        '',
        '',
        'def confirm():',
        '    mailer_of_the_day().send()',
      ),
    };
    expect(run(files)).toEqual(
      [
        wrapped('mailing.py', 5, 'resolve_mailer'),
        wrapped('orders.py', 5, 'mailer_of_the_day'),
        LOOKUP_IN_SHARED,
      ].sort(),
    );
  });

  it('finds a lookup through a container that another module defines', () => {
    const files = {
      'src/shop/containers.py': code('import punq', '', 'container = punq.Container()'),
      'src/shop/orders.py': code(
        'from shop.containers import container',
        '',
        '',
        'def confirm():',
        '    container.resolve(Mailer)',
      ),
    };
    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      `${RULE} src/shop/orders.py:5 punq.Container.resolve`,
    ]);
  });

  it('counts a helper in a composition root from outside the roots, and not one without a lookup', () => {
    const files = {
      'src/shop/main.py': code(
        'import punq',
        '',
        'container = punq.Container()',
        '',
        '',
        'def resolve_mailer():',
        '    return container.resolve(Mailer)',
      ),
      'src/shop/plain.py': code('def mailer():', '    return 1'),
      'src/shop/orders.py': code(
        'from shop.main import resolve_mailer',
        'from shop.plain import mailer',
        '',
        '',
        'def confirm():',
        '    resolve_mailer()',
        '    mailer()',
      ),
    };
    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      `${RULE} src/shop/orders.py:6 resolve_mailer via punq.Container.resolve in src/shop/main.py`,
    ]);
  });
});
