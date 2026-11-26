export declare class Mutex {
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
  acquire(): Promise<() => void>;
}
export declare class Semaphore {
  constructor(permits: number);
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
  acquire(): Promise<[number, () => void]>;
}
