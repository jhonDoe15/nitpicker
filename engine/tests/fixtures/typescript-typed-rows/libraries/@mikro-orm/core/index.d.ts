export declare class EntityManager {
  find<T>(entity: new () => T, where?: object, options?: object): Promise<T[]>;
  findOne<T>(entity: new () => T, where?: object, options?: object): Promise<T | null>;
  count<T>(entity: new () => T, where?: object): Promise<number>;
}
