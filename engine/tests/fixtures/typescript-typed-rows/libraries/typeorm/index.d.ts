export type FindOptionsWhere<E> = { [P in keyof E]?: E[P] | object };
type Relations<E> = string[] | { [P in keyof E]?: boolean | object };
export interface FindOneOptions<E = any> {
  where?: FindOptionsWhere<E> | FindOptionsWhere<E>[];
  select?: { [P in keyof E]?: boolean } | string[];
  relations?: Relations<E>;
  order?: { [P in keyof E]?: 'ASC' | 'DESC' | object };
  withDeleted?: boolean;
  lock?: { mode: string };
  relationLoadStrategy?: 'join' | 'query';
  loadEagerRelations?: boolean;
  cache?: boolean;
  transaction?: boolean;
  take?: number;
  skip?: number;
}
export interface FindManyOptions<E = any> extends FindOneOptions<E> {}
export declare class SelectQueryBuilder<T> {
  where(condition: string, values?: object): this;
  leftJoinAndSelect(property: string, alias: string): this;
  setLock(mode: string): this;
  take(count: number): this;
  getMany(): Promise<T[]>;
  getCount(): Promise<number>;
}
export declare class Repository<T> {
  find(options?: FindManyOptions<T>): Promise<T[]>;
  findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]>;
  findByIds(ids: unknown[]): Promise<T[]>;
  findOne(options: FindOneOptions<T>): Promise<T | null>;
  findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null>;
  findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]>;
  count(options?: FindManyOptions<T>): Promise<number>;
  countBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<number>;
  exists(options?: FindManyOptions<T>): Promise<boolean>;
  existsBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<boolean>;
  createQueryBuilder(alias: string): SelectQueryBuilder<T>;
}
export declare class EntityManager {
  find<T>(target: new () => T, options?: FindManyOptions<T>): Promise<T[]>;
  findBy<T>(target: new () => T, where: FindOptionsWhere<T>): Promise<T[]>;
  findOneBy<T>(target: new () => T, where: FindOptionsWhere<T>): Promise<T | null>;
  existsBy<T>(target: new () => T, where: FindOptionsWhere<T>): Promise<boolean>;
  exists<T>(target: new () => T, options?: FindManyOptions<T>): Promise<boolean>;
  findOne<T>(target: new () => T, options: FindOneOptions<T>): Promise<T | null>;
  count<T>(target: new () => T, options?: FindManyOptions<T>): Promise<number>;
  countBy<T>(target: new () => T, where: FindOptionsWhere<T>): Promise<number>;
  getRepository<T>(target: new () => T): Repository<T>;
}
export declare class DataSource {
  constructor(options: object);
  getRepository<T>(target: new () => T): Repository<T>;
}
export declare function Entity(): ClassDecorator;
export declare function Column(): PropertyDecorator;
export declare function Index(): PropertyDecorator;
export declare function ManyToOne(type: () => Function, options?: object): PropertyDecorator;
export declare function ManyToMany(
  type: () => Function, inverse?: (value: any) => unknown, options?: object,
): PropertyDecorator;
export declare function OneToMany(
  type: () => Function, inverse: (value: any) => unknown, options?: object,
): PropertyDecorator;
