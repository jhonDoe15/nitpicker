export type Compute<T> = { [K in keyof T]: T[K] };
export type DefaultSelection<P extends { scalars: object }> = Compute<P["scalars"]>;
export type GetResult<P extends { scalars: object }, S> = S extends null ? never : Compute<P["scalars"]>;