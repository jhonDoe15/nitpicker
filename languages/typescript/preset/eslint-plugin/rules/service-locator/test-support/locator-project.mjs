import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';

const CASE_NAME_LENGTH = 12;
const TSCONFIG = {
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
};
const LIBRARIES = {
  '@inversifyjs/container': [
    'type Factory<T> = (context: { container: Container }) => T;',
    'export interface Binding<T> {',
    '  toDynamicValue(factory: Factory<T>): Binding<T>;',
    '  toFactory(factory: Factory<() => T>): Binding<T>;',
    '  toProvider(factory: Factory<() => Promise<T>>): Binding<T>;',
    '  onActivation(handler: (context: { container: Container }, value: T) => T): Binding<T>;',
    '}',
    'export declare class Container {',
    '  bind<T>(id: unknown): Binding<T>;',
    '  get<T>(id: unknown): T;',
    '  getAsync<T>(id: unknown): Promise<T>;',
    '  getAll<T>(id: unknown): T[];',
    '  getNamed<T>(id: unknown, name: string): T;',
    '  getTagged<T>(id: unknown, key: string, value: string): T;',
    '  resolve<T>(target: new (...args: never[]) => T): T;',
    '  load(...modules: unknown[]): void;',
    '}',
  ],
  inversify: ["export { Container } from '@inversifyjs/container';"],
  tsyringe: [
    'export interface DependencyContainer {',
    '  register<T>(token: unknown, provider: { useFactory: (container: DependencyContainer) => T }): DependencyContainer;',
    '  resolve<T>(token: unknown): T;',
    '  resolveAll<T>(token: unknown): T[];',
    '  createChildContainer(): DependencyContainer;',
    '}',
    'export declare const container: DependencyContainer;',
    'export declare function instanceCachingFactory<T>(factory: (c: DependencyContainer) => T): (c: DependencyContainer) => T;',
    'export declare function predicateAwareClassFactory<T>(predicate: (c: DependencyContainer) => boolean, a: new () => T, b: new () => T): (c: DependencyContainer) => T;',
  ],
  typedi: [
    'export declare class ContainerInstance {',
    '  get<T>(id: unknown): T;',
    '  getMany<T>(id: unknown): T[];',
    '}',
    'export declare class Container {',
    '  static get<T>(id: unknown): T;',
    '  static getMany<T>(id: unknown): T[];',
    '  static of(id?: string): ContainerInstance;',
    '  static set(options: { id: unknown; factory: () => unknown }): void;',
    '}',
    'export declare function Service(options?: { factory: () => unknown }): ClassDecorator;',
  ],
  awilix: [
    'export interface AwilixContainer<Cradle extends object = {}> {',
    '  readonly cradle: Cradle;',
    '  resolve<T>(name: string): T;',
    '  createScope(): AwilixContainer<Cradle>;',
    '}',
    'export declare function createContainer(): AwilixContainer<any>;',
    'export declare function asFunction<T>(fn: (...args: any[]) => T): { singleton(): unknown };',
    'export declare function asClass<T>(type: new (...args: any[]) => T): { singleton(): unknown };',
    'export declare function asValue<T>(value: T): unknown;',
  ],
  '@nestjs/common': [
    'export interface INestApplicationContext {',
    '  get<T>(token: unknown): T;',
    '  resolve<T>(token: unknown): Promise<T>;',
    '}',
    'export interface INestApplication extends INestApplicationContext {',
    '  listen(port: number): Promise<void>;',
    '}',
  ],
  '@nestjs/core': [
    "import type { INestApplication } from '@nestjs/common';",
    'export declare abstract class ModuleRef {',
    '  abstract get<T>(token: unknown): T;',
    '  abstract resolve<T>(token: unknown): Promise<T>;',
    '  abstract create<T>(type: new () => T): Promise<T>;',
    '}',
    'export declare class NestFactory {',
    '  static create(module: unknown): Promise<INestApplication>;',
    '}',
  ],
  'plain-container': [
    'export declare class Container { get(id: string): string; }',
    'export declare function bind(id: string): { toDynamicValue(factory: () => unknown): void };',
  ],
};
const SOURCES = {
  'src/shared/mail.ts': [
    "import { container } from 'tsyringe';",
    "import { Mailer } from '../mailer';",
    'export const resolveMailer = (): Mailer => container.resolve(Mailer);',
    'export const resolveService = <T>(token: unknown): T => container.resolve<T>(token);',
    'export function noLookup(): number { return 1; }',
    '',
  ].join('\n'),
  'src/shared/two-levels.ts': [
    "import { resolveMailer, resolveService } from './mail';",
    'export function mailerOfTheDay() { return resolveMailer(); }',
    'export function serviceOfTheDay(token: string) { return resolveService(token); }',
    'export const serviceAgain = (token: string) => serviceOfTheDay(token);',
    "export const fixedService = () => serviceOfTheDay('mailer');",
    '',
  ].join('\n'),
  'src/shared/cycle.ts': [
    'export function ping(): number { return pong(); }',
    'export function pong(): number { return ping(); }',
    '',
  ].join('\n'),
  'src/shared/registry.ts': [
    "import { container } from 'tsyringe';",
    "export const registerMailer = () => container.register('a', { useFactory: (c) => c.resolve('b') });",
    '',
  ].join('\n'),
  'src/di.ts': [
    "export { container as di } from 'tsyringe';",
    "import { Container } from 'inversify';",
    'export const local = new Container();',
    '',
  ].join('\n'),
  'src/main.ts': [
    "import { container } from 'tsyringe';",
    "import { Mailer } from './mailer';",
    'export const rootMailer = () => container.resolve(Mailer);',
    'export const rootService = (token: string) => container.resolve(token);',
    '',
  ].join('\n'),
  'src/mailer.ts': 'export class Mailer { send(): void {} }\n',
  'src/shared/reexport.ts':
    "export { resolveMailer as lookupMailer, resolveService as lookupService } from './mail';\n",
  'src/shared/index.ts': "export * from './mail';\nexport * from './two-levels';\n",
};

function writerFor(root) {
  return (relative, text) => {
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) {
      throw new Error(`${relative} is outside ${root}`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
}

function writeProject(write) {
  write('tsconfig.json', JSON.stringify(TSCONFIG));
  for (const [name, lines] of Object.entries(LIBRARIES)) {
    write(
      `node_modules/${name}/package.json`,
      JSON.stringify({ name, version: '1.0.0', types: 'index.d.ts' }),
    );
    write(`node_modules/${name}/index.d.ts`, `${lines.join('\n')}\n`);
  }
  for (const [file, text] of Object.entries(SOURCES)) {
    write(file, text);
  }
}

export function createLocatorProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-service-locator-')));
  const write = writerFor(root);
  writeProject(write);
  return {
    write,
    tester: typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root }),
    typed: (code, errors, { file, options } = {}) => {
      const name = createHash('sha256').update(code).digest('hex').slice(0, CASE_NAME_LENGTH);
      const filename = write(file ?? `src/features/case-${name}.ts`, code);
      return {
        filename,
        code,
        ...(options === undefined ? {} : { options }),
        ...(errors === undefined ? {} : { errors }),
      };
    },
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function lookup(api) {
  return [{ messageId: 'lookup', data: { api } }];
}

export function lookups(...apis) {
  return apis.map((api) => ({ messageId: 'lookup', data: { api } }));
}

export function wrapper(name, api, file) {
  return [{ messageId: 'wrapper', data: { name, api, file } }];
}

export const MAIL = 'tsyringe DependencyContainer.resolve';
