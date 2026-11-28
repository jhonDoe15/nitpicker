export declare class Document<T = unknown, Helpers = unknown, DocType = unknown> { _id: T; doc: DocType; helpers: Helpers; save(): Promise<this> }
export type HydratedDocument<DocType> = Document<unknown, {}, DocType> & DocType;
export declare class Connection { close(): Promise<void> }