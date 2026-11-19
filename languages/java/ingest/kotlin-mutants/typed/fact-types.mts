export type Mutant = {
  readonly className: string;
  readonly method: string;
  readonly methodDescription: string;
  readonly mutatorName: string;
  readonly description: string;
  readonly line: number;
};

export type PropertyFacts = {
  readonly name: string;
  readonly getter: boolean;
  readonly setter: boolean;
  readonly delegated: boolean;
  readonly start: number;
  readonly end: number;
};

export type ClassFacts = {
  readonly name: string;
  readonly kind: string;
  readonly start: number;
  readonly headerEnd: number;
  readonly init: boolean;
  readonly functions: readonly string[];
  readonly properties: readonly PropertyFacts[];
};

export type FunctionFacts = {
  readonly class: string;
  readonly name: string;
  readonly jvmName: string | undefined;
  readonly staticIn: string | undefined;
  readonly suspend: boolean;
  readonly inline: boolean;
  readonly returnsUnit: boolean;
  readonly inlineCalls: readonly unknown[];
  readonly start: number;
  readonly end: number;
};

export type LambdaFacts = {
  readonly start: number;
  readonly end: number;
  readonly callee: string;
  readonly returnLines: readonly number[];
  readonly valueLines: readonly number[];
  readonly discarded: boolean;
  readonly unitCallee: boolean;
  readonly projectCallee: boolean;
};

export type FileFacts = {
  readonly lines: number;
  readonly classes: ReadonlyMap<string, ClassFacts>;
  readonly functions: readonly FunctionFacts[];
  readonly lambdas: readonly LambdaFacts[];
  readonly branching: ReadonlySet<number>;
  readonly casts: ReadonlySet<number>;
  readonly exhaustiveLastEntries: ReadonlySet<number>;
};

export type FactsIndex = { readonly files: ReadonlyMap<string, FileFacts> };

export type RuleContext = {
  readonly mutant: Mutant;
  readonly file: FileFacts | undefined;
  readonly cls: ClassFacts | undefined;
  readonly declared: ReadonlySet<string>;
  readonly siblings: ReadonlySet<string>;
};

export type MutantRule = readonly [string, (context: RuleContext) => boolean];
