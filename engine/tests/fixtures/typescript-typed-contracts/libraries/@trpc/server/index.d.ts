export interface BuiltRouter<Context> { createCaller(context: Context): unknown }
export declare function router<Context>(context: Context): BuiltRouter<Context>;