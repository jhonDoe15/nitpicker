import type { Node, Statement } from 'typescript';

export type NamespaceScope = {
  readonly prefix: string;
  readonly anchor: Statement | undefined;
  readonly isExported: (declaration: Node) => boolean;
};

export type ScopedStatement = NamespaceScope & { readonly statement: Statement };
