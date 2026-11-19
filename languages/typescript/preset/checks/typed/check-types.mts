export type CheckExclusions = {
  readonly general: string[];
  readonly production: string[];
};

export type QualityCheck = {
  readonly name: string;
  readonly kind?: string;
  readonly version?: string;
  readonly exclusions: readonly string[];
  readonly shardWeight: number;
  readonly timeoutMs?: number;
  readonly configurationFiles: readonly string[];
  readonly dependencies?: readonly string[];
  readonly concurrencyWeight?: number;
  readonly concurrencyGroup?: string;
  readonly executionPriority?: number;
  readonly reportedTools?: readonly string[];
  readonly adapterArguments?: readonly string[];
  readonly publishesModuleImports?: true;
  readonly colocatedWith?: readonly string[];
  readonly patterns?: readonly string[];
  readonly configRelativePath?: string;
  readonly ignoreRelativePath?: string;
  readonly policyFiles?: readonly string[];
};

export type EntryPointsCheck = {
  readonly name: string;
  readonly sourceRoot: string;
  readonly sourceRoots: readonly string[];
  readonly exclusions: readonly string[];
  readonly version: string;
  readonly shardWeight: number;
  readonly logicalFiles: readonly string[];
};

export type EslintCheck = QualityCheck & {
  readonly configRelativePath: string;
  readonly patterns: readonly string[];
  readonly policyFiles: readonly string[];
};

export type EslintCheckOptions = {
  readonly name: string;
  readonly shardWeight: number;
  readonly colocatedWith?: readonly string[];
};

export type QualityChecks = {
  readonly generalExclusions: string[];
  readonly productionExclusions: string[];
  readonly eslintChecks: EslintCheck[];
  readonly entryPointsCheck: EntryPointsCheck;
  readonly staticChecks: QualityCheck[];
  readonly qualityAreaChecks: QualityCheck[];
};
