import type TypeScript from 'typescript';

export type ModuleReference = {
  readonly kind: 'import' | 'export' | 'dynamic' | 'require' | 'type-import';
  readonly node: TypeScript.Node;
  readonly specifier: string | undefined;
  readonly literal?: TypeScript.Node | undefined;
  readonly prefix?: string;
};

export type ImporterReference = ModuleReference & { readonly importer: string };
