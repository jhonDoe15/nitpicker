import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-service-locator-')));

export function write(relative, text) {
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
    'export declare function instanceCachingFactory<T>(factory: (c: DependencyContainer) => T): (c: DependencyContainer) => T;',
    'export declare function predicateAwareClassFactory<T>(predicate: (c: DependencyContainer) => boolean, a: new () => T, b: new () => T): (c: DependencyContainer) => T;',
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
library(
  'plain-container',
  [
    'export declare class Container { get(id: string): string; }',
    'export declare function bind(id: string): { toDynamicValue(factory: () => unknown): void };',
  ].join('\n'),
);

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

export function removeProject() {
  rmSync(root, { recursive: true, force: true });
}

export const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

export function typed(code, errors, { file, options } = {}) {
  const name = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const filename = write(file ?? `src/features/case-${name}.ts`, code);
  return {
    filename,
    code,
    ...(options === undefined ? {} : { options }),
    ...(errors === undefined ? {} : { errors }),
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
