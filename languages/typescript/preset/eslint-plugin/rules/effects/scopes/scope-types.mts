import type { TSESTree } from '@typescript-eslint/utils';
import type { FunctionNode } from '../../typed/syntax-views.mts';
import type { VisitorKeys } from '../../typed/node-views.mts';
import type { Call } from '../../loops/builders/chain-execution.mts';

export type { Call, FunctionNode, VisitorKeys };
export type OpenerFunction = FunctionNode & { readonly parent: TSESTree.CallExpression };
export type ScopeKind = 'transaction' | 'lock';
export type Role = 'begins' | 'ends';
export type Branch =
  | TSESTree.IfStatement
  | TSESTree.CatchClause
  | TSESTree.SwitchCase
  | TSESTree.ConditionalExpression;
export type Construct =
  | TSESTree.SwitchStatement
  | TSESTree.IfStatement
  | TSESTree.CatchClause
  | TSESTree.ConditionalExpression;
export type Part = TSESTree.Node | undefined;
export type Marker = {
  readonly call: Call;
  readonly role: Role;
  readonly branch: Branch | undefined;
};
export type HeldScope = {
  readonly opener: Call;
  readonly calls: Call[];
  readonly param: TSESTree.Node | undefined;
  readonly root: TSESTree.Node;
  readonly closing: TSESTree.Node | undefined;
};
export type BodyIndex = {
  readonly body: TSESTree.Node;
  readonly calls: Call[];
  readonly markers: Marker[];
  readonly scopes: Map<Call, HeldScope>;
};
