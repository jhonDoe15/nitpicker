import { afterAll, describe, expect, it } from 'vitest';
import { rule } from './no-service-locator.mjs';
import { rootFileMatcher } from './root-files.mjs';
import {
  MAIL,
  lookup,
  lookups,
  removeProject,
  tester,
  typed,
  wrapper,
  write,
} from './test-support/locator-project.mjs';

afterAll(removeProject);

const CHAIN_DEPTH = 2000;
const HEADER = "import { container } from 'tsyringe';\nimport { Mailer } from '../mailer';";
const SHAPES = 'src/shared/shapes.ts';

write(
  'src/shared/default-helper.ts',
  `${HEADER}\nexport default () => container.resolve(Mailer);\n`,
);
write(
  SHAPES,
  [
    HEADER,
    'const once = <T>(fn: () => T) => fn;',
    'export const lazyMailer = once(() => container.resolve(Mailer));',
    'export const castMailer = (() => container.resolve(Mailer)) as () => Mailer;',
    'export const checkedMailer = (() => container.resolve(Mailer)) satisfies () => Mailer;',
    'export class Holder {',
    '  mailer = () => container.resolve(Mailer);',
    '  static shared = () => container.resolve(Mailer);',
    '  get lazy() { return container.resolve(Mailer); }',
    '}',
    'export class Built { readonly mailer = container.resolve(Mailer); }',
    'export class Constructed { constructor() { container.resolve(Mailer); } }',
    'export function withDefault(m = container.resolve(Mailer)) { return m; }',
    'export function plain() { return container.resolve(Mailer); }',
    'export interface MailSource { mailer(): Mailer }',
    '',
  ].join('\n'),
);
write(
  'src/shared/chain.ts',
  [
    HEADER,
    ...Array.from({ length: CHAIN_DEPTH }, (_, index) =>
      index === CHAIN_DEPTH - 1
        ? `export function f${String(index)}(): Mailer { return container.resolve(Mailer); }`
        : `export function f${String(index)}(): Mailer { return f${String(index + 1)}(); }`,
    ),
    '',
  ].join('\n'),
);

const AT_SHAPES = (name) => wrapper(name, MAIL, SHAPES);
const FROM_SHAPES =
  "import { Holder, Built, Constructed, withDefault, plain, lazyMailer, castMailer, checkedMailer } from '../shared/shapes';\n";
const AWILIX = "import { createContainer } from 'awilix';\nconst c = createContainer();\n";
const TSYRINGE =
  "import { container, instanceCachingFactory, predicateAwareClassFactory } from 'tsyringe';\n";

tester.run('no-service-locator registration factories', rule, {
  valid: [
    typed(
      `${TSYRINGE}export const wire = () => container.register('a', { useFactory: instanceCachingFactory((c) => c.resolve('b')) });`,
    ),
    typed(
      `${TSYRINGE}class A {}\nclass B {}\nexport const wire = () => container.register('a', { useFactory: predicateAwareClassFactory((c) => c.resolve('flag') !== undefined, A, B) });`,
    ),
    typed(
      "import { Container } from 'inversify';\nfunction build(context: { container: Container }) { return context.container.get('b'); }\nexport const wire = (c: Container) => c.bind('a').toDynamicValue(build);",
    ),
    typed(
      `${TSYRINGE}const build = (c: typeof container) => c.resolve('b');\nexport const wire = () => container.register('a', { useFactory: build });`,
    ),
    typed(
      `${TSYRINGE}const useFactory = (c: typeof container) => c.resolve('b');\nexport const wire = () => container.register('a', { useFactory });`,
    ),
    typed(
      "import { plain } from '../shared/shapes';\nexport const m = (s: import('../shared/shapes').MailSource) => s.mailer();",
    ),
  ],
  invalid: [
    typed(
      "import { bind } from 'plain-container';\nimport { container } from 'tsyringe';\nexport const wire = () => bind('a').toDynamicValue(() => container.resolve('x'));",
      lookup(MAIL),
    ),
    typed(
      "import { Container } from 'inversify';\nexport function build(context: { container: Container }) { return context.container.get('b'); }",
      lookup('inversify Container.get'),
    ),
  ],
});

tester.run('no-service-locator lookup methods used as values', rule, {
  valid: [],
  invalid: [
    typed(
      "import { container } from 'tsyringe';\nexport const all = ['a'].map(container.resolve);",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve.bind(container)('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = Reflect.apply(container.resolve, container, ['a']);",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const r = container.resolve;",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const { resolve } = container;",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = [(0, container.resolve)('a'), container!.resolve('b'), (container.resolve)('c')];",
      lookups(MAIL, MAIL, MAIL),
    ),
    typed(`${AWILIX}export const x = c['cradle'].mailer;`, lookup('awilix AwilixContainer.cradle')),
    typed(`${AWILIX}export const { cradle } = c;`, lookup('awilix AwilixContainer.cradle')),
    typed(
      `${AWILIX}export const x = (c.cradle as unknown as () => void)();`,
      lookup('awilix AwilixContainer.cradle'),
    ),
    typed(
      "import { ModuleRef } from '@nestjs/core';\nexport class Mailing { constructor(private readonly moduleRef: ModuleRef) {}\n  mailer: unknown;\n  onModuleInit() { this.mailer = this.moduleRef.get('mailer'); } }",
      [
        {
          message:
            'Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), and look it up only where the app is composed (the composition root: main, server, or a file listed in "layout.entryPoints"). `@nestjs/core ModuleRef.get` is a service lookup. A lookup hides what this code needs from its signature and fails only when it runs, if the registration is missing.',
        },
      ],
    ),
  ],
});

tester.run('no-service-locator helpers of every shape', rule, {
  valid: [],
  invalid: [
    typed(
      "import mail from '../shared/default-helper';\nexport const m = mail();",
      wrapper('mail', MAIL, 'src/shared/default-helper.ts'),
    ),
    typed(`${FROM_SHAPES}export const m = lazyMailer();`, AT_SHAPES('lazyMailer')),
    typed(`${FROM_SHAPES}export const m = castMailer();`, AT_SHAPES('castMailer')),
    typed(`${FROM_SHAPES}export const m = checkedMailer();`, AT_SHAPES('checkedMailer')),
    typed(`${FROM_SHAPES}export const m = new Holder().mailer();`, AT_SHAPES('mailer')),
    typed(`${FROM_SHAPES}export const m = Holder.shared();`, AT_SHAPES('shared')),
    typed(`${FROM_SHAPES}export const m = new Holder().lazy;`, AT_SHAPES('lazy')),
    typed(`${FROM_SHAPES}export const m = new Built();`, AT_SHAPES('Built')),
    typed(`${FROM_SHAPES}export const m = new Constructed();`, AT_SHAPES('Constructed')),
    typed(`${FROM_SHAPES}export const m = withDefault();`, AT_SHAPES('withDefault')),
    typed(`${FROM_SHAPES}const p = plain;\nexport const m = p();`, AT_SHAPES('p')),
    typed(`${FROM_SHAPES}export const all = ['a'].map(plain);`, AT_SHAPES('plain')),
    typed(`${FROM_SHAPES}export const m = plain.call(undefined);`, AT_SHAPES('plain')),
    typed(`${FROM_SHAPES}export const m = (0, plain)();`, AT_SHAPES('plain')),
    typed("import { f0, f1000 } from '../shared/chain';\nexport const m = [f0(), f1000()];", [
      { messageId: 'wrapper', data: { name: 'f0', api: MAIL, file: 'src/shared/chain.ts' } },
      { messageId: 'wrapper', data: { name: 'f1000', api: MAIL, file: 'src/shared/chain.ts' } },
    ]),
  ],
});

describe('no-service-locator options', () => {
  it('names the option when the composition root pattern is not a regular expression', () => {
    expect(() => rootFileMatcher({ compositionRootPattern: '(' })).toThrow(
      /"compositionRootPattern" option "\(" is not a valid regular expression/u,
    );
  });
});
