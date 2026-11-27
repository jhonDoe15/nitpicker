export type FindManyOptions = { where?: object; relations?: string[] | Record<string, boolean> };
export declare class SelectQueryBuilder<T> {
  leftJoinAndMapMany(property: string, alias: string): this;
  innerJoin(property: string, alias: string): this;
  andWhere(condition: string): this;
  leftJoinAndSelect(property: string, alias: string): this;
  innerJoinAndSelect(property: string, alias: string): this;
  where(condition: string, values?: object): this;
  getMany(): Promise<T[]>;
}
export declare class Repository<T> {
  find(options?: FindManyOptions): Promise<T[]>;
  findBy(where: object): Promise<T[]>;
  findOneBy(where: object): Promise<T | null>;
  save<E>(entity: E): Promise<E>;
  create(entity?: object): T;
  createQueryBuilder(alias: string): SelectQueryBuilder<T>;
  findAndCount(options?: FindManyOptions): Promise<[T[], number]>;
  findAndCountBy(where: object): Promise<[T[], number]>;
}
export declare class EntityManager {
  save<E>(entity: E, value?: object): Promise<E>;
  find<T>(target: new () => T, options?: FindManyOptions): Promise<T[]>;
  getRepository<T>(target: new () => T): Repository<T>;
}
export declare class QueryRunner {
  manager: EntityManager;
  startTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}
export declare class DataSource {
  getRepository<T>(target: new () => T): Repository<T>;
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
  createQueryRunner(): QueryRunner;
}
type RelationOptions = { lazy?: boolean; eager?: boolean };
export declare function In<T>(values: T[]): T[];
export declare class EntitySchema<T = any> { constructor(options: object); }
export declare function Entity(): ClassDecorator;
export declare function Column(): PropertyDecorator;
export declare function ManyToOne(type: () => Function, options?: RelationOptions): PropertyDecorator;
export declare function OneToMany(
  type: () => Function, inverse: (value: any) => unknown, options?: RelationOptions,
): PropertyDecorator;

export declare function OneToOne(type: () => Function, options?: RelationOptions): PropertyDecorator;
export declare function ManyToMany(type: () => Function, options?: RelationOptions): PropertyDecorator;
export interface EntityManager { findBy<T>(target: new () => T, where: object): Promise<T[]>; }
