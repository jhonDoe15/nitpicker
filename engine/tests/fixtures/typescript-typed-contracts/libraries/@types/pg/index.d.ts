export declare class Pool { query(): Promise<unknown>; }
export declare class Client { end(): Promise<void>; }
export interface QueryResult<R = unknown> { rows: R[] }
