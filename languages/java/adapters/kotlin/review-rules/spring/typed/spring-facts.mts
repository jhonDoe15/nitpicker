export type Argument = {
  text: string;
  name?: string | undefined;
  spread: boolean;
  lambda: boolean;
};

export type Annotation = {
  name: string;
  type?: string | undefined;
  arguments: Argument[];
};

export type Import = {
  path: string;
  alias?: string | undefined;
  all: boolean;
};

export type ParameterFact = {
  name: string;
  type?: string | undefined;
  vararg: boolean;
  default: boolean;
  property?: string | undefined;
  initializer?: string | undefined;
  initializerTypeArguments?: string | undefined;
  initializerQualifier?: string | undefined;
  defaultValue?: string | undefined;
  owner?: string | undefined;
  computed?: true;
  delegated?: true;
  abstract?: true;
  line: number;
  annotationEntries?: Annotation[] | undefined;
};

type TypeBound = { name: string; bound?: string | undefined };

export type ClassFact = {
  name: string;
  qualified: string;
  kind: string;
  line: number;
  supers: string[];
  annotations: Annotation[];
  primaryParameters: ParameterFact[];
  genericSupers?: string[] | undefined;
  typeBounds?: TypeBound[] | undefined;
  constructorAnnotations?: Annotation[] | undefined;
  data: boolean;
  open: boolean;
  superClass?: string | undefined;
  visibility?: string | undefined;
  annotationEntries?: Annotation[] | undefined;
};

type ForwardFact = {
  name: string;
  qualifier?: string | undefined;
  typeArgumentList?: string | undefined;
};

export type FunctionFact = {
  name: string;
  line: number;
  owner: string;
  parameters: ParameterFact[];
  annotationEntries?: Annotation[] | undefined;
  visibility?: string | undefined;
  hasBody: boolean;
  returnType?: string | undefined;
  returns?: string | undefined;
  expressionBody?: true;
  forward?: ForwardFact | undefined;
  receiver?: string | undefined;
  modifiers: string[];
  typeBounds?: TypeBound[] | undefined;
};

export type PropertyFact = {
  name: string;
  line: number;
  owner: string;
  type?: string | undefined;
  initializer?: string | undefined;
  initializerTypeArguments?: string | undefined;
  initializerQualifier?: string | undefined;
  annotationEntries?: Annotation[] | undefined;
  literalText?: string | undefined;
  literal?: true;
  var: boolean;
  computed?: true;
  delegated: boolean;
  abstract?: true;
};

export type ScopeParameter = {
  name: string;
  type?: string | undefined;
  component?: number | undefined;
};

export type ScopeFact = {
  id: number;
  k: string;
  name?: string | undefined;
  qualified?: string | undefined;
  parent?: number | undefined;
  line: number;
  condition?: string | undefined;
  host?: string | undefined;
  qualifier?: string | undefined;
  argument?: string | undefined;
  range?: string | undefined;
  params?: ScopeParameter[] | undefined;
  reads?: string[] | undefined;
};

export type InvocationFact = {
  line: number;
  scope: number;
  name: string;
  arguments: Argument[];
  receiver?: string | undefined;
  assignedTo?: string | undefined;
  after?: string[] | undefined;
  assign?: true;
  index?: true;
  reference?: true;
  previous?: { name: string; arguments: Argument[] } | undefined;
  statement?: true;
  safe?: true;
  returned?: true;
  throwing?: true;
  guarded?: true;
  arms?: string[] | undefined;
  afterThrowing?: string[] | undefined;
  elvis?: string | undefined;
  branch?: true;
  result?: true;
  host?: string | undefined;
  iterated?: string | undefined;
};

export type LocalFact = {
  name: string;
  scope: number;
  line: number;
  type?: string | undefined;
  initializer?: string | undefined;
  initializerTypeArguments?: string | undefined;
  component?: number | undefined;
  alias?: string | undefined;
};

type NullTest = {
  operator: string;
  fallback?: string | undefined;
  condition?: string | undefined;
  subject: string;
  line: number;
  scope: number;
};

type CatchFact = {
  line: number;
  scope: number;
  type: string;
  name?: string | undefined;
  throws?: true;
};

type ThrowFact = { scope: number; type: string; caught?: true };

export type ExceptionUse = {
  scope: number;
  line: number;
  name: string;
  path: string[];
  calls: { receiver?: string | undefined }[];
  parameter?: true;
  context?: string | undefined;
  argumentOf?: string | undefined;
  local?: string | undefined;
};

export type SpringFile = {
  file: string;
  test: boolean;
  package: string;
  imports: Import[];
  classes: ClassFact[];
  functions: FunctionFact[];
  properties: PropertyFact[];
  scopes: ScopeFact[];
  invocations: InvocationFact[];
  locals?: LocalFact[] | undefined;
  nullTests?: NullTest[] | undefined;
  globals?: PropertyFact[] | undefined;
  exceptionUses: ExceptionUse[];
  literals: { scope: number; name: string }[];
  nullReturns: { scope: number; line: number }[];
  catches: CatchFact[];
  throws?: ThrowFact[] | undefined;
};
