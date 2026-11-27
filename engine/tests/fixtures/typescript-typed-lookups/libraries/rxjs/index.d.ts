export declare class Observable<T> { pipe(...operators: any[]): Observable<any>; subscribe(next?: (value: T) => void): void; }
export declare function from<T>(input: Iterable<T> | ArrayLike<T> | Promise<T> | Observable<T>): Observable<T>;
export declare function of<T>(...values: T[]): Observable<T>;
export declare function defer<T>(factory: () => any): Observable<T>;
export declare function mergeMap(project: (value: any, index: number) => any, concurrent?: number): any;
export declare function flatMap(project: (value: any, index: number) => any, concurrent?: number): any;
export declare function concatMap(project: (value: any, index: number) => any): any;
export declare function switchMap(project: (value: any, index: number) => any): any;
export declare function exhaustMap(project: (value: any, index: number) => any): any;
export declare function bufferCount(size: number): any;
export declare function toArray(): any;
export declare function map(project: (value: any) => any): any;
export declare function take(count: number): any;
export declare function takeLast(count: number): any;
export declare function tap(next: (value: any) => void): any;
export declare function filter(predicate: (value: any) => boolean): any;
export declare function reduce(acc: (a: any, v: any) => any, seed?: any): any;
export declare function first(): any;
export declare const asyncScheduler: { schedule(work: () => void): void };
