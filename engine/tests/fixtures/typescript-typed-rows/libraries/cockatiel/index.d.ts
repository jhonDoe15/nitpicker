export interface IPolicy { execute<T>(work: () => T): Promise<T>; }
export declare class RetryPolicy implements IPolicy { execute<T>(work: () => T): Promise<T>; }
export declare class CircuitBreakerPolicy implements IPolicy {
  execute<T>(work: () => T): Promise<T>;
}
export declare function retry(...args: unknown[]): RetryPolicy;
export declare function handleAll(): unknown;
export declare function wrap(...policies: IPolicy[]): IPolicy;
