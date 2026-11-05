import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'service-locator-lookup';
const hit = (line, subject) => `${RULE}:${String(line)} ${subject}`;
const code = (...lines) => `${lines.join('\n')}\n`;
const INJECTOR_GET = 'injector.Injector.get';

describe.skipIf(!enabled)('service-locator-lookup on lookup methods used as values', () => {
  it('reports a lookup method passed on, read by name or called on the class', () => {
    const [actual, expected] = outcomes([
      [
        'a bound method passed to map and to partial',
        code(
          'import functools',
          'from injector import Injector',
          '',
          '',
          'def run(injector: Injector, types):',
          '    services = list(map(injector.get, types))',
          '    return services, functools.partial(injector.get, Mailer)',
        ),
        [hit(6, INJECTOR_GET), hit(7, INJECTOR_GET)],
      ],
      [
        'getattr with a literal name and an unbound call on the class',
        code(
          'from injector import Injector',
          '',
          '',
          'def run(injector: Injector, name):',
          '    found = getattr(injector, "get")(Mailer)',
          '    other = getattr(injector, name)',
          '    return found, other, Injector.get(injector, Mailer)',
        ),
        [hit(5, INJECTOR_GET), hit(7, INJECTOR_GET)],
      ],
      [
        'call_with_injection and __getitem__',
        code(
          'from injector import Injector',
          'from kink import di',
          '',
          '',
          'def run(injector: Injector):',
          '    injector.call_with_injection(send)',
          '    return di.__getitem__(Mailer)',
        ),
        [hit(6, 'injector.Injector.call_with_injection'), hit(7, 'kink.di[...]')],
      ],
      [
        'names that a star import of the library brings in',
        code('from injector import *', '', '', 'def run():', '    return Injector().get(Mailer)'),
        [hit(5, INJECTOR_GET)],
      ],
      [
        'a lookup inside a binder.bind registration',
        code(
          'from injector import Injector',
          '',
          '',
          'def wire(injector: Injector):',
          '    injector.binder.bind(Mailer, to=lambda: injector.get(Smtp))',
        ),
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('service-locator-lookup roots and look-alike modules', () => {
  it('treats a module with a main guard as a composition root', () => {
    const [actual, expected] = outcomes([
      [
        'a script with a main guard',
        code(
          'from injector import Injector',
          '',
          '',
          'def main():',
          '    injector = Injector()',
          '    injector.get(Mailer).send()',
          '',
          '',
          'if __name__ == "__main__":',
          '    main()',
        ),
        [],
      ],
      [
        'the same module without the guard',
        code(
          'from injector import Injector',
          '',
          '',
          'def main():',
          '    injector = Injector()',
          '    injector.get(Mailer).send()',
        ),
        [hit(6, INJECTOR_GET)],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('does not take a project module named like a library for the library', () => {
    const files = {
      'src/injector/__init__.py': code(
        'class Injector:',
        '    def get(self, key):',
        '        return key',
      ),
      'src/punq.py': code('class Container:', '    def resolve(self, key):', '        return key'),
      'src/shop/orders.py': code(
        'import punq',
        'from injector import Injector',
        '',
        '',
        'def run():',
        '    return Injector().get(1), punq.Container().resolve(2)',
      ),
    };
    expect(findingsOf(files, { sourceRoots: ['src'] })).toEqual([]);
  });
});
