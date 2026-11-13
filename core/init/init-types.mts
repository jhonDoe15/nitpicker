export type PackageManager = {
  readonly run: string;
  readonly install: string;
  readonly add: string;
};

export type NodeManager = PackageManager & {
  readonly name: string | undefined;
  readonly root: string;
  readonly locked: boolean;
  readonly major?: number | undefined;
  readonly declaration?: { readonly field: unknown; readonly directory: string } | undefined;
};

export type InitProject = {
  readonly family: string;
  readonly preset: string;
  readonly summary: string;
  readonly notes: readonly string[];
  readonly packageManager?: NodeManager;
  readonly testRunner?: string;
  readonly typeChecker?: string;
  readonly tool?: string;
  readonly buildTool?: string;
  readonly javaSources?: unknown;
};

export type Peers = {
  readonly missing: readonly string[];
  readonly uninstalled: readonly string[];
  readonly undeclared: readonly string[];
  readonly installedOnly: readonly string[];
  readonly command?: string;
  readonly advice?: string;
  readonly requirements?: string;
  readonly absent?: readonly string[];
  readonly outdated?: readonly string[];
  readonly blockers?: readonly string[];
};

export type WorkflowContext = {
  readonly project: InitProject;
  readonly peers?: Peers;
  readonly version: unknown;
  readonly repository: string;
};
