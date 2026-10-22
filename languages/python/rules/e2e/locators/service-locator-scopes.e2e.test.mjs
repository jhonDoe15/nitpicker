import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'service-locator-lookup';
const hit = (line, subject) => `${RULE}:${String(line)} ${subject}`;
const code = (...lines) => `${lines.join('\n')}\n`;
const INJECTOR_GET = 'injector.Injector.get';
const PUNQ_RESOLVE = 'punq.Container.resolve';

describe.skipIf(!enabled)('service-locator-lookup follows the scope of a name', () => {
  it('lets a parameter or a local shadow a container name of the module', () => {
    const [actual, expected] = outcomes([
      [
        'a dict parameter next to an Injector parameter',
        code(
          'from injector import Injector',
          '',
          '',
          'def a(x: Injector):',
          '    return x.get(1)',
          '',
          '',
          'def b(x: dict):',
          '    return x.get(1)',
        ),
        [hit(5, INJECTOR_GET)],
      ],
      [
        'a parameter named like the imported kink container',
        code(
          'from kink import di',
          '',
          '',
          'def run(di: dict):',
          '    return di["x"]',
          '',
          '',
          'def other():',
          '    return di["x"]',
        ),
        [hit(9, 'kink.di[...]')],
      ],
      [
        'a local that rebinds a container name',
        code(
          'from injector import Injector',
          '',
          'injector = Injector()',
          '',
          '',
          'def a():',
          '    injector = {}',
          '    return injector.get(1)',
          '',
          '',
          'def b():',
          '    return injector.get(Mailer)',
        ),
        [hit(12, INJECTOR_GET)],
      ],
      [
        'an unannotated parameter named like a container',
        code(
          'import punq',
          '',
          'container = punq.Container()',
          '',
          '',
          'def run(container):',
          '    return container.resolve(Mailer)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('does not take a parameter named like an imported helper for the helper', () => {
    const files = {
      'src/shop/shared.py': code(
        'import punq',
        '',
        'container = punq.Container()',
        '',
        '',
        'def resolve_mailer():',
        '    return container.resolve(Mailer)',
      ),
      'src/shop/orders.py': code(
        'from shop.shared import resolve_mailer',
        '',
        '',
        'def confirm(resolve_mailer):',
        '    resolve_mailer()',
      ),
    };
    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([
      `${RULE} src/shop/shared.py:7 ${PUNQ_RESOLVE}`,
    ]);
  });
});

describe.skipIf(!enabled)('service-locator-lookup and registration factories', () => {
  it('allows a lookup inside a factory that is registered, and flags the others', () => {
    const [actual, expected] = outcomes([
      [
        'kink and lagom lambdas',
        code(
          'from kink import di',
          'from lagom import Container',
          '',
          'container = Container()',
          'di[Svc] = lambda di: Svc(di[Cfg])',
          'container[Svc] = lambda: Svc(container[Cfg])',
          'di.factories[Other] = lambda di: Other(di[Cfg])',
        ),
        [],
      ],
      [
        'punq factory lambda and function',
        code(
          'import punq',
          '',
          'p = punq.Container()',
          '',
          '',
          'def factory():',
          '    return Svc(p.resolve(Cfg))',
          '',
          '',
          'p.register(Svc, factory=lambda: Svc(p.resolve(Cfg)))',
          'p.register(Other, factory=factory)',
        ),
        [],
      ],
      [
        'a lookup that runs at registration time, and a function never registered',
        code(
          'import punq',
          '',
          'p = punq.Container()',
          '',
          '',
          'def unused():',
          '    return p.resolve(Cfg)',
          '',
          '',
          'p.register(Svc, instance=p.resolve(Cfg))',
        ),
        [hit(7, PUNQ_RESOLVE), hit(10, PUNQ_RESOLVE)],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('service-locator-lookup through inheritance', () => {
  it('follows a project container and a custom injector module through their bases', () => {
    const [actual, expected] = outcomes([
      [
        'a container that extends a project container',
        code(
          'from dependency_injector import containers, providers',
          '',
          '',
          'class Base(containers.DeclarativeContainer):',
          '    mailer = providers.Factory(Mailer)',
          '',
          '',
          'class Child(Base):',
          '    pass',
          '',
          '',
          'def run():',
          '    return Child.mailer()',
        ),
        [hit(13, 'dependency_injector Child.mailer')],
      ],
      [
        'a module that extends a custom module base',
        code(
          'from injector import Injector, Module, provider',
          '',
          '',
          'class BaseModule(Module):',
          '    pass',
          '',
          '',
          'class MailModule(BaseModule):',
          '    @provider',
          '    def mailer(self, injector: Injector) -> Mailer:',
          '        return injector.get(Mailer)',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('service-locator-lookup of the ways a container is named', () => {
  it('reads the annotations a container is declared with', () => {
    const [actual, expected] = outcomes(
      [
        '"Injector"',
        'Injector | None',
        'Optional[Injector]',
        'Union[Injector, None]',
        '"Injector | None"',
        'Annotated[Injector, "x"]',
      ].map((annotation) => [
        annotation,
        code(
          'from typing import Annotated, Optional, Union',
          'from injector import Injector',
          '',
          '',
          `def run(injector: ${annotation}):`,
          '    return injector.get(Mailer)',
        ),
        [hit(6, INJECTOR_GET)],
      ]),
    );
    expect(actual).toEqual(expected);
  });

  it('follows a default, a returning function and an alias of an instance', () => {
    const [actual, expected] = outcomes([
      [
        'injector or a new Injector',
        code(
          'from injector import Injector',
          '',
          '',
          'def run(injector=None):',
          '    injector = injector or Injector()',
          '    return injector.get(Mailer)',
        ),
        [hit(6, INJECTOR_GET)],
      ],
      [
        'a function annotated to return a container',
        code(
          'import punq',
          '',
          '',
          'def get_container() -> punq.Container:',
          '    return make()',
          '',
          '',
          'def run():',
          '    return get_container().resolve(Mailer)',
        ),
        [hit(9, PUNQ_RESOLVE)],
      ],
      [
        'an alias of an instance',
        code(
          'import punq',
          '',
          'c = punq.Container()',
          'd = c',
          '',
          '',
          'def run():',
          '    return d.resolve(Mailer)',
        ),
        [hit(8, PUNQ_RESOLVE)],
      ],
      [
        'a container kept on self and passed twice on one line',
        code(
          'import punq',
          '',
          '',
          'class Service:',
          '    def __init__(self, container: punq.Container) -> None:',
          '        self.container = container',
          '',
          '    def run(self):',
          '        return self.container.resolve(A), self.container.resolve(A)',
        ),
        [hit(9, PUNQ_RESOLVE)],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('knows more lookup APIs', () => {
    const [actual, expected] = outcomes([
      [
        'punq instantiate',
        code(
          'import punq',
          '',
          'c = punq.Container()',
          '',
          '',
          'def run():',
          '    return c.instantiate(Mailer)',
        ),
        [hit(7, 'punq.Container.instantiate')],
      ],
      [
        'that_depends resolve and resolver on the container class',
        code(
          'from that_depends import BaseContainer',
          '',
          '',
          'class Container(BaseContainer):',
          '    pass',
          '',
          '',
          'def run():',
          '    return Container.resolve(Mailer), Container.resolver(Mailer)',
        ),
        [hit(9, 'that_depends Container.resolve'), hit(9, 'that_depends Container.resolver')],
      ],
      [
        'delegated, abstract and nested dependency_injector providers',
        code(
          'from dependency_injector import containers, providers',
          '',
          '',
          'class Container(containers.DeclarativeContainer):',
          '    a = providers.DelegatedSingleton(A)',
          '    b = providers.DelegatedFactory(B)',
          '    c = providers.AbstractFactory(C)',
          '    d = providers.Container(Other)',
          '',
          '',
          'def run():',
          '    return Container.a(), Container.b(), Container.c(), Container.d()',
        ),
        [
          hit(12, 'dependency_injector Container.a'),
          hit(12, 'dependency_injector Container.b'),
          hit(12, 'dependency_injector Container.c'),
          hit(12, 'dependency_injector Container.d'),
        ],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('service-locator-lookup behind helpers of every shape', () => {
  const SHARED = code(
    'import punq',
    '',
    'container = punq.Container()',
    '',
    '',
    'def resolve_mailer():',
    '    return container.resolve(Mailer)',
    '',
    '',
    'def defines_closure():',
    '    def inner():',
    '        return container.resolve(Mailer)',
    '',
    '    return inner',
    '',
    '',
    'class Mail:',
    '    def __init__(self):',
    '        self.mailer = container.resolve(Mailer)',
    '',
    '    def send(self):',
    '        return container.resolve(Mailer)',
    '',
    '    def indirect(self):',
    '        return self.send()',
    '',
    '    @staticmethod',
    '    def fixed():',
    '        return container.resolve(Mailer)',
    '',
    '    @classmethod',
    '    def built(cls):',
    '        return container.resolve(Mailer)',
  );
  const via = (file, line, name, helper = 'shared.py') =>
    `${RULE} src/shop/${file}:${String(line)} ${name} via ${PUNQ_RESOLVE} in src/shop/${helper}`;
  const lookupAt = (line) => `${RULE} src/shop/shared.py:${String(line)} ${PUNQ_RESOLVE}`;
  const SHARED_LOOKUPS = [7, 12, 19, 22, 29, 33].map(lookupAt);

  it('counts only a lookup in the body of a helper, not one in a closure it defines', () => {
    const files = {
      'src/shop/shared.py': SHARED,
      'src/shop/orders.py': code(
        'from shop.shared import defines_closure',
        '',
        '',
        'def confirm():',
        '    defines_closure()',
      ),
    };
    expect(findingsOf(files, { sourceRoots: ['src'] }).sort()).toEqual(
      [...SHARED_LOOKUPS, via('shared.py', 25, 'send')].sort(),
    );
  });

  it('follows methods, static and class methods, constructors and a star re-export', () => {
    const files = {
      'src/shop/shared.py': SHARED,
      'src/shop/__init__.py': 'from shop.shared import *\n',
      'src/shop/orders.py': code(
        'from shop.shared import Mail',
        'from shop import resolve_mailer',
        '',
        '',
        'def confirm(mail: Mail):',
        '    mail.send()',
        '    Mail.fixed()',
        '    Mail.built()',
        '    Mail()',
        '    resolve_mailer()',
      ),
    };
    const found = findingsOf(files, { sourceRoots: ['src'] })
      .filter((entry) => entry.includes('orders.py'))
      .sort();
    expect(found).toEqual(
      [
        via('orders.py', 6, 'send'),
        via('orders.py', 7, 'fixed'),
        via('orders.py', 8, 'built'),
        via('orders.py', 9, 'Mail'),
        via('orders.py', 10, 'resolve_mailer'),
      ].sort(),
    );
  });
});
