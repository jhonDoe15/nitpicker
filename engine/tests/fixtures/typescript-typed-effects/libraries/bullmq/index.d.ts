export declare class Queue {
  constructor(name: string);
  add(name: string, data: unknown, options?: { jobId?: string }): Promise<unknown>;
}
