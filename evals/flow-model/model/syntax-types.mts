import type ts from 'typescript';

export type Loc = { readonly line: number; readonly column: number };

export type LitValue = string | number | boolean;
export type Primitive = LitValue | undefined;

export type ComparisonOperator = '===' | '!==' | '==' | '!=' | '<' | '<=' | '>' | '>=';

export type Unsupported = {
  readonly kind: 'unsupported';
  readonly syntax: string;
  readonly hasCall: boolean;
  readonly mutates: boolean;
  readonly writesFields?: boolean;
  readonly clobbers: readonly string[];
  readonly loc: Loc;
};

export type ParamExpr = { readonly kind: 'param'; readonly index: number; readonly name: string };
export type LocalExpr = { readonly kind: 'local'; readonly id: string; readonly name: string };
export type GlobalExpr = { readonly kind: 'global'; readonly name: string };
export type ImportExpr = {
  readonly kind: 'import';
  readonly module: string;
  readonly name: string;
};
export type HelperExpr = { readonly kind: 'helper'; readonly name: string };
export type ModuleExpr = {
  readonly kind: 'module';
  readonly name: string;
  readonly object: boolean;
  readonly members?: Readonly<Record<string, LitValue>>;
};
export type MemberCallee = {
  readonly kind: 'member';
  readonly receiver: Expr;
  readonly method: string;
};
export type DynamicCallee = { readonly kind: 'dynamic'; readonly syntax: string };
export type Callee = HelperExpr | ImportExpr | GlobalExpr | MemberCallee | DynamicCallee;

export type CallExpr = {
  readonly kind: 'call';
  readonly callee: Callee;
  readonly site: string;
  readonly args: readonly Expr[];
  readonly loc: Loc;
};
export type NewExpr = {
  readonly kind: 'new';
  readonly name: string;
  readonly global: boolean;
  readonly args: readonly Expr[];
  readonly loc: Loc;
};
export type GetExpr = {
  readonly kind: 'get';
  readonly object: Expr;
  readonly field: string | undefined;
  readonly loc?: Loc;
};
export type CompareExpr = {
  readonly kind: 'cmp';
  readonly op: ComparisonOperator;
  readonly left: Expr;
  readonly right: Expr;
  readonly loc: Loc;
};
export type LogicExpr = {
  readonly kind: 'and' | 'or';
  readonly left: Expr;
  readonly right: Expr;
  readonly loc: Loc;
};
export type NotExpr = { readonly kind: 'not'; readonly operand: Expr; readonly loc: Loc };
export type ConditionalExpr = {
  readonly kind: 'cond';
  readonly test: Expr;
  readonly then: Expr;
  readonly else: Expr;
  readonly loc: Loc;
};
export type ObjectExpr = {
  readonly kind: 'object';
  readonly fields: readonly (readonly [string, Expr])[];
};
export type TemplateExpr = {
  readonly kind: 'template';
  readonly parts: readonly (string | Expr)[];
};

export type Expr =
  | { readonly kind: 'lit'; readonly value: LitValue; readonly via?: string }
  | { readonly kind: 'undefined' }
  | ParamExpr
  | LocalExpr
  | GlobalExpr
  | ImportExpr
  | HelperExpr
  | ModuleExpr
  | GetExpr
  | CallExpr
  | NewExpr
  | CompareExpr
  | LogicExpr
  | NotExpr
  | ConditionalExpr
  | ObjectExpr
  | TemplateExpr
  | Unsupported;

export type BindStmt = {
  readonly kind: 'bind';
  readonly id: string;
  readonly name: string;
  readonly value: Expr;
  readonly loc: Loc;
};
export type SetStmt = {
  readonly kind: 'set';
  readonly object: Expr;
  readonly field: string;
  readonly value: Expr;
  readonly loc: Loc;
};
export type EvalStmt = { readonly kind: 'eval'; readonly value: Expr; readonly loc: Loc };
export type IfStmt = {
  readonly kind: 'if';
  readonly test: Expr;
  readonly testLoc: Loc;
  readonly then: readonly Stmt[];
  readonly else: readonly Stmt[];
  readonly loc: Loc;
};
export type ReturnStmt = { readonly kind: 'return'; readonly value: Expr; readonly loc: Loc };
export type ThrowStmt = { readonly kind: 'throw'; readonly value: Expr; readonly loc: Loc };
export type CompletionStmt = ReturnStmt | ThrowStmt;
export type TryStmt = {
  readonly kind: 'try';
  readonly body: readonly Stmt[];
  readonly catchId?: string;
  readonly catchFields?: readonly (readonly [string, string | undefined])[];
  readonly handler: readonly Stmt[];
  readonly loc: Loc;
};

export type Stmt = BindStmt | SetStmt | EvalStmt | IfStmt | CompletionStmt | TryStmt | Unsupported;

export type ModelNode = Expr | Stmt | Callee;

export type ParamModel = {
  readonly index: number;
  readonly name: string;
  readonly supported?: boolean;
  readonly fields?: readonly string[];
  readonly default?: Expr;
};

export type FunctionModel = {
  readonly name: string;
  readonly params: readonly ParamModel[];
  readonly async?: true;
  readonly generator?: true;
  readonly body: readonly Stmt[];
  readonly loc: Loc;
};

export type FlowModel = {
  readonly analyzer: string;
  readonly file: string;
  readonly entry: string;
  readonly functions: Readonly<Record<string, FunctionModel>>;
  readonly missingHelpers: readonly string[];
};

export type ProgramContext = {
  readonly sourceFile: ts.SourceFile;
  readonly checker: ts.TypeChecker;
};

export type ExtractContext = ProgramContext & {
  readonly fnName: string;
  readonly params: ReadonlyMap<ts.Node, Expr>;
  readonly locals: ReadonlyMap<ts.Node, LocalExpr>;
  readonly helpers: Set<string>;
  readonly sites: Map<string, number>;
};

export type FunctionNode = (ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression) & {
  readonly body: ts.ConciseBody;
};
