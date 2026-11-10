import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';

const LIBRARIES = {
  'node_modules/@prisma/client/index.d.ts': "export * from '.prisma/client';\n",
  'node_modules/@prisma/client/runtime/library.d.ts': [
    'export type Compute<T> = { [K in keyof T]: T[K] };',
    'export type DefaultSelection<P extends { scalars: object }> = Compute<P["scalars"]>;',
    'export type GetResult<P extends { scalars: object }, S> = S extends null ? never : Compute<P["scalars"]>;',
  ].join('\n'),
  'node_modules/.prisma/client/index.d.ts': [
    "import * as $Result from '@prisma/client/runtime/library';",
    'export declare class PrismaClient {',
    '  user: Prisma.UserDelegate;',
    '  post: Prisma.PostDelegate;',
    '  $transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;',
    '}',
    'export declare namespace Prisma {',
    "  type TransactionClient = Omit<PrismaClient, '$transaction'>;",
    '  interface UserDelegate { findMany(): Promise<User[]> }',
    '  interface PostDelegate { findMany(): Promise<Post[]>; findFirst(): Promise<Post | null> }',
    "  type $PostPayload = { name: 'Post'; objects: {}; scalars: { id: string; title: string }; composites: {} };",
    '  type PostGetPayload<S> = $Result.GetResult<Prisma.$PostPayload, S>;',
    '}',
    'export type Post = $Result.DefaultSelection<Prisma.$PostPayload>;',
    'export type User = { id: string; email: string; passwordHash: string };',
    "export type Role = 'admin' | 'member';",
  ].join('\n'),
  'node_modules/knex/package.json': '{"name":"knex","types":"types/index.d.ts"}',
  'node_modules/knex/types/index.d.ts': [
    'export declare namespace Knex {',
    '  interface Transaction { commit(): Promise<void> }',
    '  interface QueryBuilder<T = unknown> { first(): Promise<T> }',
    '}',
    'export interface Knex { transaction(): Promise<Knex.Transaction> }',
  ].join('\n'),
  'node_modules/@types/express/index.d.ts': [
    'export interface Request { body: unknown; params: Record<string, string> }',
    'export interface Response<ResBody = unknown> { json(body: ResBody): this; send(body: ResBody): this }',
    'export interface NextFunction { (error?: unknown): void }',
    'export type Handler = (req: Request, res: Response, next: NextFunction) => void;',
    'export interface Router { use(path: string, ...handlers: Handler[]): this; get(path: string, ...handlers: Handler[]): this }',
    'export declare function Router(): Router;',
    'export interface Express extends Router { listen(port: number, done: (req: Request) => void): void }',
    'declare function express(): Express;',
    'export default express;',
  ].join('\n'),
  'node_modules/@trpc/server/index.d.ts': [
    'export interface BuiltRouter<Context> { createCaller(context: Context): unknown }',
    'export declare function router<Context>(context: Context): BuiltRouter<Context>;',
  ].join('\n'),
  'node_modules/typeorm/index.d.ts': [
    'export declare function Entity(name?: string): ClassDecorator;',
    'export declare function Column(): PropertyDecorator;',
    'export declare class BaseEntity { save(): Promise<this> }',
    'export declare class EntityManager { find<T>(target: new () => T): Promise<T[]> }',
    'export declare class Repository<T> { find(): Promise<T[]> }',
  ].join('\n'),
  'node_modules/@nestjs/common/index.d.ts': [
    'export declare function Controller(prefix?: string): ClassDecorator;',
    'export declare function Get(path?: string): MethodDecorator;',
    'export declare function Post(path?: string): MethodDecorator;',
    'export declare function Body(): ParameterDecorator;',
    'export declare function Req(): ParameterDecorator;',
  ].join('\n'),
  'node_modules/next/server.d.ts': [
    'export declare class NextRequest { url: string }',
    'export declare class NextResponse<Body = unknown> {',
    '  body: Body;',
    '  static json<JsonBody>(body: JsonBody): NextResponse<JsonBody>;',
    '}',
  ].join('\n'),
  'node_modules/mongoose/index.d.ts': [
    'export declare class Document<T = unknown, Helpers = unknown, DocType = unknown> { _id: T; doc: DocType; helpers: Helpers; save(): Promise<this> }',
    'export type HydratedDocument<DocType> = Document<unknown, {}, DocType> & DocType;',
    'export declare class Connection { close(): Promise<void> }',
  ].join('\n'),
  'node_modules/sequelize/index.d.ts': [
    'export declare class Model { save(): Promise<this> }',
    'export declare class Transaction { commit(): Promise<void> }',
  ].join('\n'),
  'node_modules/hono/index.d.ts': 'export declare class Context { json<T>(object: T): Response }\n',
  'node_modules/@types/koa/index.d.ts':
    'export interface Context { body: unknown; status: number }\n',
};

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    module: 'esnext',
    moduleResolution: 'bundler',
    experimentalDecorators: true,
    allowJs: true,
    checkJs: true,
    noEmit: true,
    types: [],
    lib: ['ES2022', 'DOM'],
  },
  include: ['src'],
};

export function typedProject(prefix) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const folders = new Map();
  function folder(prefix) {
    const next = (folders.get(prefix) ?? 0) + 1;
    folders.set(prefix, next);
    return `${prefix}${String(next)}`;
  }
  function write(relative, content) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${relative} is outside ${root}`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  }
  write('tsconfig.json', JSON.stringify(TSCONFIG));
  for (const [relative, content] of Object.entries(LIBRARIES)) {
    write(relative, content);
  }
  const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
  return { root, write, tester, folder };
}

const CUSTOM_PRISMA = {
  'prisma/schema.prisma': [
    'generator client {',
    '  provider = "prisma-client-js"',
    '  output   = "../src/generated/prisma"',
    '}',
    '',
  ].join('\n'),
  'src/generated/prisma/index.d.ts': [
    'export declare class PrismaClient { $connect(): Promise<void> }',
    'export declare namespace Prisma {',
    "  type $AccountPayload = { name: 'Account'; scalars: { id: string; balance: number } };",
    '}',
    "type Scalars = Prisma.$AccountPayload['scalars'];",
    'export type Account = { [K in keyof Scalars]: Scalars[K] };',
  ].join('\n'),
};

export function writeCustomPrismaClient(write) {
  for (const [relative, content] of Object.entries(CUSTOM_PRISMA)) {
    write(relative, content);
  }
  return '../../../generated/prisma';
}
