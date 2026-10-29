import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { strictConfig } from '../../../eslint-config/strict.mjs';
import { rule } from './no-service-locator.mjs';
import { rootFileMatcher } from './root-files.mjs';
import {
  MAIL,
  createLocatorProject,
  lookup,
  lookups,
  wrapper,
} from './test-support/locator-project.mjs';

const { write, tester, typed, remove } = createLocatorProject();
afterAll(remove);

const CHAIN_DEPTH = 2000;
const HEADER = "import { container } from 'tsyringe';\nimport { Mailer } from '../mailer';";
const SHAPES = 'src/shared/shapes.ts';

write(
  'src/shared/default-helper.ts',
  `${HEADER}\nexport default (token: string) => container.resolve(token);\n`,
);
write(
  SHAPES,
  [
    HEADER,
    'const once = <T>(fn: T) => fn;',
    'export const lazyMailer = once((token: string) => container.resolve(token));',
    'export const castMailer = ((token: string) => container.resolve(token)) as (t: string) => Mailer;',
    'export const checkedMailer = ((token: string) => container.resolve<Mailer>(token)) satisfies (t: string) => Mailer;',
    'export class Holder {',
    '  mailer = (token: string) => container.resolve(token);',
    '  static shared = (token: string) => container.resolve(token);',
    '  get lazy() { return container.resolve.bind(container); }',
    '  get fixed() { return container.resolve(Mailer); }',
    '}',
    'export class Built { readonly mailer = container.resolve(Mailer); }',
    'export class Constructed { constructor(token: string) { container.resolve(token); } }',
    'export function withDefault(token: string, m = container.resolve(token)) { return m; }',
    'export function plain(token = Mailer) { return container.resolve(token); }',
    "export function cradled(c: import('awilix').AwilixContainer<Record<string, Mailer>>, name: string) { return [c.cradle[name], c.cradle.fixed]; }",
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
        ? `export function f${String(index)}(token: string): Mailer { return container.resolve(token); }`
        : `export function f${String(index)}(token: string): Mailer { return f${String(index + 1)}(token); }`,
    ),
    '',
  ].join('\n'),
);

const AT_SHAPES = (name) => wrapper(name, MAIL, SHAPES);
const FROM_SHAPES =
  "import { Holder, Built, Constructed, withDefault, plain, cradled, lazyMailer, castMailer, checkedMailer } from '../shared/shapes';\n";
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
    typed(
      "import { Container } from 'inversify';\nexport const wire = (c: Container) => [c.bind('a').toFactory((context) => () => context.container.get('b')), c.bind('p').toProvider((context) => () => context.container.getAsync('b')), c.bind('x').onActivation((context, value) => { context.container.get('audit'); return value; })];",
    ),
    typed(
      "import { Container, Service } from 'typedi';\nexport const wire = () => Container.set({ id: 'a', factory: () => Container.get('b') });\n@Service({ factory: () => Container.get('c') })\nexport class Orders {}",
    ),
    typed(
      `${AWILIX}import { asFunction, asClass, asValue } from 'awilix';\nclass Orders { constructor() { c.resolve('b'); } }\nexport const wire = { a: asFunction(() => c.resolve('b')).singleton(), b: asClass(class { constructor() { c.resolve('x'); } }), v: asValue(c.resolve('v')) };\nexport const own = asClass(Orders);`,
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
    typed(
      "import { Container } from '@inversifyjs/container';\nexport const x = (c: Container) => c.get('a');",
      lookup('@inversifyjs/container Container.get'),
    ),
    typed(
      "import { Container } from 'typedi';\nconst options = (make: () => unknown) => ({ factory: make });\nexport const plainFactory = { factory: () => Container.get('b') };\nexport const wrapped = options(() => Container.get('c'));",
      lookups('typedi Container.get', 'typedi Container.get'),
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
      "import { container } from 'tsyringe';\nlet resolve: unknown;\n({ resolve } = container);\nexport const r = resolve;",
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
  valid: [typed(`${FROM_SHAPES}export const m = [new Holder().fixed, new Built()];`)],
  invalid: [
    typed(
      "import mail from '../shared/default-helper';\nexport const m = mail('mailer');",
      wrapper('mail', MAIL, 'src/shared/default-helper.ts'),
    ),
    typed(`${FROM_SHAPES}export const m = lazyMailer('mailer');`, AT_SHAPES('lazyMailer')),
    typed(`${FROM_SHAPES}export const m = castMailer('mailer');`, AT_SHAPES('castMailer')),
    typed(`${FROM_SHAPES}export const m = checkedMailer('mailer');`, AT_SHAPES('checkedMailer')),
    typed(`${FROM_SHAPES}export const m = new Holder().mailer('mailer');`, AT_SHAPES('mailer')),
    typed(`${FROM_SHAPES}export const m = Holder.shared('mailer');`, AT_SHAPES('shared')),
    typed(`${FROM_SHAPES}export const m = new Holder().lazy;`, AT_SHAPES('lazy')),
    typed(`${FROM_SHAPES}export const m = new Constructed('mailer');`, AT_SHAPES('Constructed')),
    typed(`${FROM_SHAPES}export const m = withDefault('mailer');`, AT_SHAPES('withDefault')),
    typed(`${FROM_SHAPES}const p = plain;\nexport const m = p();`, AT_SHAPES('p')),
    typed(`${FROM_SHAPES}export const all = ['a'].map(plain);`, AT_SHAPES('plain')),
    typed(`${FROM_SHAPES}export const m = plain.call(undefined);`, AT_SHAPES('plain')),
    typed(`${FROM_SHAPES}export const m = (0, plain)();`, AT_SHAPES('plain')),
    typed(
      `${FROM_SHAPES}${AWILIX}export const m = cradled(c, 'mailer');`,
      wrapper('cradled', 'awilix AwilixContainer.cradle', SHAPES),
    ),
    typed("import { f0, f1000 } from '../shared/chain';\nexport const m = [f0('a'), f1000('b')];", [
      { messageId: 'wrapper', data: { name: 'f0', api: MAIL, file: 'src/shared/chain.ts' } },
      { messageId: 'wrapper', data: { name: 'f1000', api: MAIL, file: 'src/shared/chain.ts' } },
    ]),
    typed(
      "import { resolveService } from '../shared/mail';\nexport const x = resolveService('a');",
      [
        {
          message:
            '`resolveService()` looks up the token it is given in a container (it calls `tsyringe DependencyContainer.resolve` in src/shared/mail.ts), so this call is a service lookup. Take the dependency as a constructor parameter typed with the narrow interface the code needs, or build it in a factory provider (`useFactory`, `toDynamicValue`), instead of asking a helper for it. A lookup hides what this code needs from its signature and fails only when it runs, if the registration is missing.',
        },
      ],
    ),
  ],
});

function contextFor(code, options = []) {
  const source = ts.createSourceFile('src/orders.ts', code, ts.ScriptTarget.Latest);
  const program = {
    getSourceFiles: () => [source],
    getSourceFile: () => source,
    isSourceFileFromExternalLibrary: () => false,
    getTypeChecker: () => ({}),
    getCompilerOptions: () => ({}),
    getCurrentDirectory: () => '/',
  };
  return { filename: 'src/orders.ts', options, sourceCode: { parserServices: { program } } };
}

function pythonEntryStems() {
  const roots = readFileSync(
    path.resolve(import.meta.dirname, '../../../../../python/rules/environment/roots.py'),
    'utf8',
  );
  const block = /ENTRY_STEMS = \{([^}]*)\}/u.exec(roots)[1];
  return [...block.matchAll(/"([^"]+)"/gu)].map(([, stem]) => stem);
}

describe('no-service-locator options and scope', () => {
  it('names the option when the composition root pattern is not a regular expression', () => {
    const message =
      'nitpicker/no-service-locator: the "compositionRootPattern" option "(" is not a valid regular expression (Invalid regular expression: /(?:(?:^|/)(?:main/(?:(?:main|server|composition-root)\\.[cm]?[jt]sx?|composition-root/.+)|src/(?:main|server|composition-root)\\.[cm]?[jt]sx?)$)|(?:()/: Unterminated group). Fix the pattern in the rule options.';

    expect(() => rule.create(contextFor('', [{ compositionRootPattern: '(' }]))).toThrow(message);
  });

  it('skips the whole-program work when no file imports a container library', () => {
    expect(Object.keys(rule.create(contextFor("import { get } from 'lodash';")))).toEqual([]);
    expect(Object.keys(rule.create(contextFor("import { container } from 'tsyringe';")))).toEqual([
      'CallExpression',
      'NewExpression',
      'MemberExpression',
      'ObjectPattern > Property',
      'Identifier',
    ]);
  });

  it('treats the entry files Python treats as composition roots as roots, outside domain/', () => {
    const matches = rootFileMatcher(undefined);
    const stems = pythonEntryStems().filter((stem) => stem !== '__main__');

    expect(stems.filter((stem) => !matches(`/p/src/${stem}.ts`))).toEqual([]);
    expect([matches('/p/src/features/orders/domain/app.ts'), matches('/p/src/orders.ts')]).toEqual([
      false,
      false,
    ]);
  });

  it('runs on production sources only, not on tests', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: strictConfig({}) });
    const severity = async (file) =>
      (await eslint.calculateConfigForFile(file))?.rules?.['nitpicker/no-service-locator']?.[0];

    expect([await severity('src/orders.ts'), await severity('src/orders.test.ts')]).toEqual([
      2,
      undefined,
    ]);
  });
});
