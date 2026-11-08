import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TYPEORM = `
export interface FindOneOptions<T> { where?: unknown; relations?: unknown; relationLoadStrategy?: 'join' | 'query' }
export declare class SelectQueryBuilder<T> {
  leftJoinAndSelect(property: string | Function, alias: string, condition?: string): this;
  innerJoinAndSelect(property: string | Function, alias: string, condition?: string): this;
  where(condition: string, parameters?: object): this;
  select(selection?: string): SelectQueryBuilder<T>;
  from<E>(entity: new () => E, alias: string): SelectQueryBuilder<E>;
  getMany(): Promise<T[]>;
}
export declare class Repository<T> {
  find(options?: FindOneOptions<T>): Promise<T[]>;
  findOne(options: FindOneOptions<T>): Promise<T | null>;
  findAndCount(options?: FindOneOptions<T>): Promise<[T[], number]>;
  createQueryBuilder(alias?: string): SelectQueryBuilder<T>;
}
export declare class EntityManager {
  find<E>(entity: new () => E, options?: FindOneOptions<E>): Promise<E[]>;
  createQueryBuilder<E>(entity: new () => E, alias: string): SelectQueryBuilder<E>;
  createQueryBuilder(): SelectQueryBuilder<unknown>;
}
export declare function Entity(): ClassDecorator;
export declare function OneToMany(...args: unknown[]): PropertyDecorator;
export declare function ManyToMany(...args: unknown[]): PropertyDecorator;
export declare function ManyToOne(...args: unknown[]): PropertyDecorator;
`;

const MIKRO_ORM = `
export declare class Collection<T> { getItems(): T[] }
export type Ref<T> = T & { unwrap(): T };
export declare enum LoadStrategy { JOINED = 'joined', SELECT_IN = 'select-in' }
export interface FindOptions { populate?: readonly string[]; strategy?: LoadStrategy | 'joined' | 'select-in' }
export declare class EntityManager {
  find<E>(entity: new () => E, where: object, options?: FindOptions): Promise<E[]>;
  findOne<E>(entity: new () => E, where: object, options?: FindOptions): Promise<E | null>;
}
export declare class EntityRepository<T> { findAll(options?: FindOptions): Promise<T[]> }
`;

const SEQUELIZE = `
export declare class Model {
  static findAll<M extends Model>(this: new () => M, options?: object): Promise<M[]>;
  static findByPk<M extends Model>(this: new () => M, id: unknown, options?: object): Promise<M | null>;
  static findAndCountAll<M extends Model>(this: new () => M, options?: object): Promise<{ rows: M[]; count: number }>;
}
export type NonAttribute<T> = T & { readonly brand?: true };
`;

const ENTITIES = `
import { Collection, Ref } from '@mikro-orm/core';
import { Model, NonAttribute } from 'sequelize';
export class Tag { id!: number; }
export class Option { id!: number; tags!: Tag[]; notes!: Tag[]; }
export class Customer { id!: number; addresses!: Tag[]; }
export class Item { id!: number; options!: Option[]; labels!: Tag[]; order!: Order; }
export class Order {
  id!: number;
  items!: Item[];
  payments!: Tag[];
  customer!: Customer;
  lazyItems!: Promise<Item[]>;
}
export class Book { id!: number; }
export class Author { id!: number; books = new Collection<Book>(); prizes!: Collection<Book>; mentor!: Ref<Author>; }
export class Line extends Model { declare id: number; }
export class Invoice extends Model {
  declare lines?: NonAttribute<Line[]>;
  declare refunds?: NonAttribute<Line[]>;
  declare buyer?: NonAttribute<Line>;
}
`;

function write(root, file, text) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

export function ormProject() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-collection-joins-')));
  write(root, 'node_modules/typeorm/index.d.ts', TYPEORM);
  write(root, 'node_modules/@mikro-orm/core/index.d.ts', MIKRO_ORM);
  write(root, 'node_modules/sequelize/index.d.ts', SEQUELIZE);
  write(root, 'src/entities.ts', ENTITIES);
  write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        target: 'es2022',
        useDefineForClassFields: false,
      },
      include: ['src/**/*.ts'],
    }),
  );
  return root;
}
