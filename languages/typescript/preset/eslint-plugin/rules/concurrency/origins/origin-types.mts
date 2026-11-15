import type { TSESTree } from '@typescript-eslint/utils';
import type { ModuleBindings } from '../../security/imported-names.mts';
import type { Context } from '../../security/security-values.mts';

export type CreationNode = TSESTree.CallExpression | TSESTree.NewExpression;
export type ClientSpec = {
  readonly kind: 'remote' | 'message' | 'limiter';
  readonly methods: ReadonlySet<string> | '*';
  readonly makers: ReadonlySet<string>;
  readonly types: ReadonlySet<string>;
  readonly functions: ReadonlySet<string>;
  readonly derivers: ReadonlySet<string>;
  readonly callable: boolean;
  readonly deep: boolean;
  readonly makerPattern?: RegExp;
  readonly typePattern?: RegExp;
  readonly valid?: (creation: CreationNode | undefined) => boolean;
};
export type SpecOf = (source: string) => ClientSpec | undefined;
export type Ref = {
  readonly source: string;
  readonly imported: string | undefined;
  readonly instance: false;
};
type ModuleOrigin = Ref & {
  readonly spec: ClientSpec;
  readonly member?: string | undefined;
};
export type InstanceOrigin = {
  readonly source: string;
  readonly spec: ClientSpec;
  readonly instance: true;
  readonly creation: CreationNode | undefined;
};
export type Origin = ModuleOrigin | InstanceOrigin;
export type MaybeOrigin = Origin | undefined;
export type Goal = {
  readonly node: TSESTree.Node | undefined;
  readonly depth: number;
  value: MaybeOrigin;
  children: Goal[];
  combine: (values: MaybeOrigin[]) => MaybeOrigin;
};
export type Link = {
  readonly node: TSESTree.Node | undefined;
  readonly combine: (base: MaybeOrigin) => MaybeOrigin;
};
export type Origins = {
  readonly originOf: (node: TSESTree.Node) => MaybeOrigin;
  readonly moduleRef: (scopeNode: TSESTree.Node, name: string) => Ref | undefined;
};
export type Env = {
  readonly context: Context;
  readonly clientSpec: SpecOf;
  readonly entries: readonly { readonly source: string; readonly bindings: ModuleBindings }[];
  readonly typeImports: ReadonlyMap<string, Ref>;
};
export type TypeName = { readonly owner?: string | undefined; readonly name: string | undefined };
export type Invocation = {
  readonly callee: TSESTree.Expression;
  readonly parent?: TSESTree.Node | undefined;
};
