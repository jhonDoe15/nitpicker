export type Conventions = Readonly<Record<string, unknown>>;

export type SettingKey = 'lineLength' | 'quotes' | 'indentation';

export type Wins = (key: SettingKey) => boolean;

export type FormatSet = Readonly<Record<string, string | number>>;

export type ScopePattern = { readonly pattern: string; readonly directory: string };

export type RuffScope = {
  readonly exclude: ScopePattern[] | undefined;
  readonly extendExclude: ScopePattern[];
  readonly forceExclude: unknown;
  readonly targetVersion: string | undefined;
};

export type BlackScope = {
  readonly exclude: string | undefined;
  readonly extendExclude: string | undefined;
  readonly forceExclude: string | undefined;
  readonly targetVersions: string[] | undefined;
  readonly requiresPython: boolean;
};

export type RuffConfig = {
  readonly file: string;
  readonly files: string[];
  readonly set: FormatSet;
  readonly scope: RuffScope;
};

export type BlackConfig = {
  readonly file: string;
  readonly files: string[];
  readonly hasTable: boolean;
  readonly set: FormatSet;
  readonly scope: BlackScope;
};

export type RuffLayers = RuffConfig & {
  readonly layers: { readonly file: string; readonly table: Readonly<Record<string, unknown>> }[];
};

export type ProjectChoice<Config> =
  | { readonly optedIn: false; readonly project: Config | undefined; readonly wins: Wins }
  | { readonly optedIn: true; readonly project: Config; readonly wins: Wins };

export type ProjectRequest = {
  readonly formatter: string;
  readonly precedence: string[] | undefined;
  readonly policyRoot: string;
  readonly conventions?: unknown;
};

export type FormatContext = {
  readonly project: { readonly formatter: string; readonly targetVersion: string };
  readonly conventions: Conventions;
  readonly toolPrecedence?: Readonly<Record<string, string[] | undefined>> | undefined;
  readonly policyRoot?: string | undefined;
  readonly projectRoot: string;
  readonly reportRoot?: string | undefined;
  readonly exclude: readonly string[];
};

type PlanBase = {
  readonly formatter: string;
  readonly conventions: Conventions;
  readonly policyRoot: string;
  readonly root: string;
  readonly targetVersion: string;
  readonly reportRoot?: string | undefined;
  readonly exclude: readonly string[];
};

export type RuffPlanInput = PlanBase & ProjectChoice<RuffConfig>;

export type BlackPlanInput = PlanBase & ProjectChoice<BlackConfig>;

export type FormatPlan = { readonly options: string[]; readonly command: string };
