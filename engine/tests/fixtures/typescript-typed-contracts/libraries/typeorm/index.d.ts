export declare function Entity(name?: string): ClassDecorator;
export declare function Column(): PropertyDecorator;
export declare class BaseEntity { save(): Promise<this> }
export declare class EntityManager { find<T>(target: new () => T): Promise<T[]> }
export declare class Repository<T> { find(): Promise<T[]> }