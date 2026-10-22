import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-service-locator.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-service-locator-')));

function write(relative, text) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function library(name, declarations) {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' }),
  );
  write(`node_modules/${name}/index.d.ts`, `${declarations}\n`);
}

write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      experimentalDecorators: true,
      lib: ['ES2022'],
      types: [],
    },
    include: ['src'],
  }),
);
library(
  'inversify',
  [
    'export declare class Container {',
    '  bind<T>(id: unknown): { toDynamicValue(factory: (context: { container: Container }) => T): void };',
    '  get<T>(id: unknown): T;',
    '  getAsync<T>(id: unknown): Promise<T>;',
    '  getAll<T>(id: unknown): T[];',
    '  getNamed<T>(id: unknown, name: string): T;',
    '  getTagged<T>(id: unknown, key: string, value: string): T;',
    '  resolve<T>(target: new (...args: never[]) => T): T;',
    '  load(...modules: unknown[]): void;',
    '}',
  ].join('\n'),
);
library(
  'tsyringe',
  [
    'export interface DependencyContainer {',
    '  register<T>(token: unknown, provider: { useFactory: (container: DependencyContainer) => T }): DependencyContainer;',
    '  resolve<T>(token: unknown): T;',
    '  resolveAll<T>(token: unknown): T[];',
    '  createChildContainer(): DependencyContainer;',
    '}',
    'export declare const container: DependencyContainer;',
  ].join('\n'),
);
library(
  'typedi',
  [
    'export declare class ContainerInstance {',
    '  get<T>(id: unknown): T;',
    '  getMany<T>(id: unknown): T[];',
    '}',
    'export declare class Container {',
    '  static get<T>(id: unknown): T;',
    '  static getMany<T>(id: unknown): T[];',
    '  static of(id?: string): ContainerInstance;',
    '}',
  ].join('\n'),
);
library(
  'awilix',
  [
    'export interface AwilixContainer<Cradle extends object = {}> {',
    '  readonly cradle: Cradle;',
    '  resolve<T>(name: string): T;',
    '  createScope(): AwilixContainer<Cradle>;',
    '}',
    'export declare function createContainer(): AwilixContainer<any>;',
  ].join('\n'),
);
library(
  '@nestjs/common',
  [
    'export interface INestApplicationContext {',
    '  get<T>(token: unknown): T;',
    '  resolve<T>(token: unknown): Promise<T>;',
    '}',
    'export interface INestApplication extends INestApplicationContext {',
    '  listen(port: number): Promise<void>;',
    '}',
  ].join('\n'),
);
library(
  '@nestjs/core',
  [
    "import type { INestApplication } from '@nestjs/common';",
    'export declare abstract class ModuleRef {',
    '  abstract get<T>(token: unknown): T;',
    '  abstract resolve<T>(token: unknown): Promise<T>;',
    '  abstract create<T>(type: new () => T): Promise<T>;',
    '}',
    'export declare class NestFactory {',
    '  static create(module: unknown): Promise<INestApplication>;',
    '}',
  ].join('\n'),
);
library('plain-container', 'export declare class Container { get(id: string): string; }');

write('src/mailer.ts', 'export class Mailer { send(): void {} }\n');
write(
  'src/shared/mail.ts',
  [
    "import { container } from 'tsyringe';",
    "import { Mailer } from '../mailer';",
    'export const resolveMailer = (): Mailer => container.resolve(Mailer);',
    'export function noLookup(): number { return 1; }',
    '',
  ].join('\n'),
);
write(
  'src/shared/two-levels.ts',
  [
    "import { resolveMailer } from './mail';",
    'export function mailerOfTheDay() { return resolveMailer(); }',
    'export const mailerAgain = () => mailerOfTheDay();',
    '',
  ].join('\n'),
);
write('src/shared/reexport.ts', "export { resolveMailer as lookupMailer } from './mail';\n");
write('src/shared/index.ts', "export * from './mail';\nexport * from './two-levels';\n");
write(
  'src/shared/cycle.ts',
  [
    'export function ping(): number { return pong(); }',
    'export function pong(): number { return ping(); }',
    '',
  ].join('\n'),
);
write(
  'src/shared/registry.ts',
  [
    "import { container } from 'tsyringe';",
    "export const registerMailer = () => container.register('a', { useFactory: (c) => c.resolve('b') });",
    '',
  ].join('\n'),
);
write(
  'src/di.ts',
  [
    "export { container as di } from 'tsyringe';",
    "import { Container } from 'inversify';",
    'export const local = new Container();',
    '',
  ].join('\n'),
);
write(
  'src/main.ts',
  [
    "import { container } from 'tsyringe';",
    "import { Mailer } from './mailer';",
    'export const rootMailer = () => container.resolve(Mailer);',
    '',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code, errors, { file, options } = {}) {
  const name = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const filename = write(file ?? `src/features/case-${name}.ts`, code);
  return {
    filename,
    code,
    ...(options === undefined ? {} : { options }),
    ...(errors === undefined ? {} : { errors }),
  };
}

function lookup(api) {
  return [{ messageId: 'lookup', data: { api } }];
}

function lookups(...apis) {
  return apis.map((api) => ({ messageId: 'lookup', data: { api } }));
}

function wrapper(name, api, file) {
  return [{ messageId: 'wrapper', data: { name, api, file } }];
}

const MAIL = 'tsyringe DependencyContainer.resolve';

tester.run('no-service-locator', rule, {
  valid: [
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      {
        file: 'src/main/main.ts',
      },
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = new Container().get('a');",
      undefined,
      {
        file: 'src/main/composition-root.ts',
      },
    ),
    typed("import { Container } from 'typedi';\nexport const x = Container.get('a');", undefined, {
      file: 'src/server.ts',
    }),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      { file: 'src/boot/start.ts', options: [{ entryPoints: ['src/boot/start.ts'] }] },
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      { file: 'src/jobs/run.ts', options: [{ compositionRootPattern: '/jobs/run\\.ts$' }] },
    ),
    typed("import { rootMailer } from '../main';\nexport const mailer = rootMailer();"),
    typed("import { noLookup } from '../shared/mail';\nexport const n = noLookup();"),
    typed("const cache = new Map<string, string>();\nexport const x = cache.get('a');"),
    typed(
      "import { Container } from 'plain-container';\nconst c = new Container();\nexport const x = c.get('a');",
    ),
    typed('export const x = { get(id: string) { return id; } }.get("a");'),
    typed('type Cradle = { mailer: string };\nexport const run = ({ mailer }: Cradle) => mailer;'),
    typed(
      "import { container } from 'tsyringe';\nexport const wire = () => container.register('a', { useFactory: (c) => c.resolve('b') });",
    ),
    typed(
      "import { Container } from 'inversify';\nexport const wire = (c: Container) => c.bind('a').toDynamicValue((context) => context.container.get('b'));",
    ),
    typed(
      "import { Container } from 'inversify';\nexport const provider = { provide: 'a', useFactory(c: Container) { return c.get('b'); } };",
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const reads = container.register;\nexport const own = container.isRegistered;",
    ),
    typed("import { lookupMailer } from '../shared/reexport';\nexport const m = [lookupMailer];"),
    typed("import { ping } from '../shared/cycle';\nexport const x = ping();"),
    typed(
      "import { registerMailer } from '../shared/registry';\nexport const x = registerMailer();",
    ),
    typed(
      "import { container } from 'tsyringe';\nimport { resolveMailer } from '../shared/mail';\nexport const wire = () => container.register('a', { useFactory: () => resolveMailer() });",
    ),
  ],
  invalid: [
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolveAll('a');",
      lookup('tsyringe DependencyContainer.resolveAll'),
    ),
    typed(
      "import { container as c } from 'tsyringe';\nexport const x = c.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import * as di from 'tsyringe';\nexport const x = di.container.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.createChildContainer().resolve('a');",
      lookup(MAIL),
    ),
    typed("import { di } from '../di';\nexport const x = di.resolve('a');", lookup(MAIL)),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container?.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container['resolve']('a');",
      lookup(MAIL),
    ),
    typed(
      "import { Container } from 'inversify';\nconst c = new Container();\nexport const x = c.get('a');",
      lookup('inversify Container.get'),
    ),
    typed(
      "import { local } from '../di';\nexport const x = local.getAll('a');",
      lookup('inversify Container.getAll'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = (c: Container) => c.getAsync('a');",
      lookup('inversify Container.getAsync'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = (c: Container) => [c.getNamed('a', 'n'), c.getTagged('a', 'k', 'v')];",
      lookups('inversify Container.getNamed', 'inversify Container.getTagged'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport class Service { constructor(private readonly c: Container) {}\n  run() { return this.c.resolve(Service); } }",
      lookup('inversify Container.resolve'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.get('a');",
      lookup('typedi Container.get'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.getMany('a');",
      lookup('typedi Container.getMany'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.of('tenant').get('a');",
      lookup('typedi ContainerInstance.get'),
    ),
    typed(
      "import { createContainer } from 'awilix';\nconst c = createContainer();\nexport const x = c.resolve('a');",
      lookup('awilix AwilixContainer.resolve'),
    ),
    typed(
      "import { createContainer } from 'awilix';\nconst c = createContainer();\nexport const x = c.cradle.mailer;",
      lookup('awilix AwilixContainer.cradle'),
    ),
    typed(
      "import { ModuleRef } from '@nestjs/core';\nexport class Mailing { constructor(private readonly moduleRef: ModuleRef) {}\n  mailer() { return this.moduleRef.get('mailer'); } }",
      lookup('@nestjs/core ModuleRef.get'),
    ),
    typed(
      "import { ModuleRef } from '@nestjs/core';\nexport class Mailing { constructor(private readonly moduleRef: ModuleRef) {}\n  mailer() { return this.moduleRef.resolve('mailer'); }\n  fresh() { return this.moduleRef.create(Mailing); } }",
      lookups('@nestjs/core ModuleRef.resolve', '@nestjs/core ModuleRef.create'),
    ),
    typed(
      "import type { INestApplication } from '@nestjs/common';\nexport const x = (app: INestApplication) => app.get('a');",
      lookup('@nestjs/common INestApplicationContext.get'),
    ),
    typed(
      "import { NestFactory } from '@nestjs/core';\nexport async function start() { const app = await NestFactory.create({}); return app.get('a'); }",
      lookup('@nestjs/common INestApplicationContext.get'),
    ),
    typed(
      "import { resolveMailer } from '../shared/mail';\nexport const x = resolveMailer();",
      wrapper('resolveMailer', MAIL, 'mail.ts'),
    ),
    typed(
      "import * as shared from '../shared/mail';\nexport const x = shared.resolveMailer();",
      wrapper('resolveMailer', MAIL, 'mail.ts'),
    ),
    typed(
      "import { resolveMailer } from '../shared';\nexport const x = resolveMailer();",
      wrapper('resolveMailer', MAIL, 'mail.ts'),
    ),
    typed(
      "import { lookupMailer } from '../shared/reexport';\nexport const x = lookupMailer();",
      wrapper('lookupMailer', MAIL, 'mail.ts'),
    ),
    typed(
      "import { mailerOfTheDay } from '../shared/two-levels';\nexport const x = mailerOfTheDay();",
      wrapper('mailerOfTheDay', MAIL, 'mail.ts'),
    ),
    typed(
      "import { mailerAgain as again } from '../shared/two-levels';\nexport const x = again();",
      wrapper('again', MAIL, 'mail.ts'),
    ),
    typed(
      "import { resolveMailer } from '../shared/mail';\nexport const x = () => () => resolveMailer();",
      wrapper('resolveMailer', MAIL, 'mail.ts'),
    ),
    typed(
      "import { resolveMailer } from '../shared/mail';\nexport const x = [resolveMailer(), resolveMailer()];",
      [
        { messageId: 'wrapper', data: { name: 'resolveMailer', api: MAIL, file: 'mail.ts' } },
        { messageId: 'wrapper', data: { name: 'resolveMailer', api: MAIL, file: 'mail.ts' } },
      ],
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      lookup(MAIL),
      { file: 'src/boot/start.ts', options: [{ entryPoints: ['src/other/start.ts'] }] },
    ),
  ],
});
