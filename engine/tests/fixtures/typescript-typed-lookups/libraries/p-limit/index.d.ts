export type LimitFunction = <T>(work: () => Promise<T>) => Promise<T>;
declare function pLimit(concurrency: number): LimitFunction;
export default pLimit;
