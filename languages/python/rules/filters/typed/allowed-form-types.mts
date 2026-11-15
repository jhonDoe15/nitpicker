export type FormFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly message?: string | undefined;
  readonly path?: string | undefined;
  readonly location?: { readonly line?: number | undefined } | undefined;
};
type OwnerSite = {
  readonly owner?: string | undefined;
  readonly path: string;
  readonly line: number;
};
type AllowedEntry = OwnerSite & { readonly rule: string };
export type LineOf = (path: string, line: number) => string | undefined;
export type KeepsOwner = (site: OwnerSite) => boolean;
export type OwningSite = OwnerSite & { readonly owned: RegExp };
export type FormOptions = {
  readonly testFiles?: readonly string[];
  readonly supportFiles?: readonly string[];
  readonly allowed?: readonly AllowedEntry[];
  readonly lineOf?: LineOf;
  readonly keepsOwner?: KeepsOwner;
};
export type FormContext = {
  readonly testFiles: ReadonlySet<string>;
  readonly supportFiles: ReadonlySet<string>;
  readonly sites: ReadonlySet<string>;
  readonly owners: readonly OwningSite[];
  readonly lineOf: LineOf;
};
