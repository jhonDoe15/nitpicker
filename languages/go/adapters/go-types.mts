export type Position = Readonly<Record<'line' | 'column', number>>;
export type CoverBlock = {
  readonly start: Position;
  readonly end: Position;
  readonly statements: number;
  readonly count: number;
};
export type CoverProfile = {
  readonly counted: boolean;
  readonly files: ReadonlyMap<string, readonly CoverBlock[]>;
};
export type Arm = {
  readonly label: string;
  readonly from: Position;
  readonly to: Position;
  readonly fallthrough?: Position | undefined;
};
export type Branch = {
  readonly file: string;
  readonly function: string;
  readonly at: Position;
  readonly arms: readonly Arm[];
  readonly implicit?: string | undefined;
};
export type Outcome = { readonly label: string; readonly count: number };
export type GoFunction = {
  readonly file: string;
  readonly name: string;
  readonly complexity: number;
  readonly start: number;
  readonly end: number;
  readonly body: Position;
  readonly close: Position;
};
export type GoFile = {
  readonly path: string;
  readonly package: string;
  readonly test: boolean;
  readonly generated: boolean;
  readonly constrained: boolean;
};
export type GoImport = {
  readonly path: string;
  readonly name: string;
  readonly line?: number | undefined;
};
export type GoSelector = { readonly qualifier: string; readonly name: string };
export type GoUsage = {
  readonly file: string;
  readonly imports: readonly GoImport[];
  readonly names: readonly string[];
  readonly selectors: readonly GoSelector[];
  readonly local: readonly string[];
};
export type GoDefinition = {
  readonly file: string;
  readonly name: string;
  readonly kind: string;
  readonly line: number;
  readonly lines: number;
  readonly exported: boolean;
  readonly entry: boolean;
  readonly literal: boolean;
  readonly tokens: readonly string[];
};
export type GoType = { readonly kind: string; readonly [field: string]: unknown };
export type GoTestName = { readonly file: string; readonly name: string };
export type GoTestFunction = GoTestName & {
  readonly start: number;
  readonly [field: string]: unknown;
};
export type NamedTests = { readonly tests: readonly GoTestName[] };
export type DesignType = {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly exported: boolean;
  readonly [field: string]: unknown;
};
export type DesignCallable = DesignType & { readonly owner: string };
type GoDesign = {
  readonly types: readonly DesignType[];
  readonly callables: readonly DesignCallable[];
};
type DocComment = { readonly [field: string]: unknown };
export type InspectReport = {
  readonly files: readonly GoFile[];
  readonly functions: readonly GoFunction[];
  readonly types: readonly GoType[];
  readonly tests: readonly GoTestFunction[];
  readonly branches: readonly Branch[];
  readonly definitions: readonly GoDefinition[];
  readonly usages: readonly GoUsage[];
  readonly docComments?: readonly DocComment[] | undefined;
  readonly design?: GoDesign | undefined;
};
export type GoPackages = {
  readonly directories: readonly string[];
  readonly nameOf: (directory: string | undefined) => string | undefined;
  readonly mains: readonly string[];
  readonly directoryOfImport: (importPath: string) => string | undefined;
  readonly importPathOf: (directory: string) => string;
  readonly isPublished: (directory: string) => boolean;
};
export type GoImportFact = {
  readonly from: string;
  readonly to: string;
  readonly names: readonly { readonly name: string; readonly alias?: string }[];
  readonly role?: string;
  readonly reexport?: true;
};
export type GoFactRole = 'test' | 'production';
type GoModuleFact = {
  readonly file: string;
  readonly role: GoFactRole;
  readonly entry: boolean;
};
export type GoConsoleFact = {
  readonly file: string;
  readonly test: string;
  readonly messages: readonly string[];
};
export type GoUnitFact = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly tokens: number;
  readonly final: boolean;
  readonly tree: unknown;
};
export type GoFacts = {
  readonly modules: readonly GoModuleFact[];
  readonly packages: readonly { readonly root: string; readonly published: boolean }[];
  readonly definitions: readonly (GoDefinition & { readonly usedLocally: boolean })[];
  readonly imports: readonly GoImportFact[];
  readonly types: readonly DesignType[];
  readonly callables: readonly DesignCallable[];
  readonly nearDuplicateUnits: readonly GoUnitFact[];
  readonly docComments: readonly DocComment[];
  readonly console: readonly GoConsoleFact[];
  readonly constrained: readonly string[];
};
export type TestOutcome = {
  readonly package: string;
  readonly name: string;
  readonly seconds: number;
  readonly outcome: string;
};
type TestOutput = {
  readonly package: string;
  readonly test: string;
  readonly output: string;
};
type TestFailure = {
  readonly id: string;
  readonly package: string;
  readonly output: string;
};
export type TestRun = {
  readonly tests: readonly TestOutcome[];
  readonly failures: readonly TestFailure[];
  readonly outputs: readonly TestOutput[];
  readonly raceOutputs: readonly TestOutput[];
  readonly buildFailures: readonly string[];
  readonly testsRan: boolean;
};
export type Spawn = (
  program: string,
  args: readonly string[],
  options: object,
) => { stdout?: string; stderr?: string; error?: Error };
export type GoPolicy = {
  readonly exceptions?: readonly unknown[] | undefined;
  readonly fileLimits?:
    { readonly folderDepth?: number; readonly [field: string]: unknown } | undefined;
  readonly crapLimit?: number | undefined;
  readonly layout?: unknown;
  readonly testConsole?: unknown;
  readonly protocols?: unknown;
  readonly conventions?: unknown;
  readonly baselineMovesFile?: string | undefined;
  readonly [field: string]: unknown;
};
export type GoContext = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly baselineRoot?: string | undefined;
  readonly baselineMovesFile?: string | undefined;
  readonly module: string;
  readonly snapshot: string;
  readonly testSeconds?: unknown;
  readonly settings: { readonly [field: string]: unknown };
  readonly [field: string]: unknown;
};
export type FindingRow = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
  readonly [field: string]: unknown;
};
export type ToolFailure = Pick<FindingRow, 'rule' | 'message'>;
