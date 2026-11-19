export type ToolOptions = {
  readonly projectRoot?: string | undefined;
  readonly bin?: string | undefined;
  readonly packageRoot?: string | undefined;
};

type Dependencies = Readonly<Record<string, string | undefined>>;

export type Manifest = {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly dependencies?: Dependencies | undefined;
  readonly peerDependencies?: Dependencies | undefined;
};

export type OwningTool = {
  readonly owningManifest: Manifest;
  readonly owningPeers: ReadonlySet<string>;
  readonly from: string;
};

export type ResolvedTool = { root: string; version: string; binPath: string | undefined };

export type OwnerRequest = { projectRoot: string | undefined; packageRoot: string };

export type Declared = { readonly name: string; readonly version: unknown };

export type DeclaredCheck = {
  readonly name: string;
  readonly installed: Manifest;
  readonly declared: Declared;
  readonly isPeer: boolean;
};
