import type { XmlElement } from '../../../../../shared/values/xml.mts';
import type { GradleStatement } from '../../../builds/typed/narrowing-types.mts';

export type Script = {
  readonly file: string;
  readonly directory: string;
  readonly statements: GradleStatement[];
};

export type Pom = {
  readonly file: string;
  readonly directory: string;
  readonly project?: XmlElement;
  readonly failure?: string;
};

export type DeclaredBuild = { readonly scripts: Script[]; readonly poms: Pom[] };

export type BuildSource = {
  readonly paths: () => string[];
  readonly readMany: (files: readonly string[]) => Map<string, string>;
};

export type FoundSetting = {
  readonly file: string;
  readonly directory: string;
  readonly name: string;
  readonly conditional: boolean;
  readonly text: string;
  readonly value: string;
};

export type Declaration = {
  readonly file: string;
  readonly text?: string;
  readonly setting: string;
  readonly value?: unknown;
  readonly path?: string | undefined;
  readonly conditional?: true;
};

export type PrecedenceLayers = { readonly usesProject: boolean; readonly nitpickerFirst: boolean };

export type ToolChoice = { readonly arguments: unknown; readonly files: readonly string[] };

export type ChoiceLayers = Pick<PrecedenceLayers, 'nitpickerFirst'>;

export type ChoiceContext = { readonly layers: ChoiceLayers; readonly root: string };

export type ToolSpec = {
  readonly label: string;
  readonly declarations: (build: DeclaredBuild) => Declaration[];
  readonly choice: (build: DeclaredBuild, context: ChoiceContext) => ToolChoice;
  readonly notice: (declarations: readonly Declaration[], layers: ChoiceLayers) => string[];
  readonly noticeable?: (declarations: readonly Declaration[]) => Declaration[];
};

export type GradleSettingOptions = {
  readonly context: RegExp;
  readonly skip?: RegExp;
  readonly names: readonly string[];
};

export type DeclaredPolicy = {
  readonly toolPrecedence?: Readonly<Record<string, readonly string[] | undefined>> | undefined;
  readonly policyRoot?: string | undefined;
};

export type ErrorproneChecks = {
  readonly reviewed: Set<string>;
  readonly off: Set<string>;
  readonly on: Set<string>;
  readonly nullAway: Map<string, unknown>;
};

export type FlagOutcome = string;

export type ErrorproneLayers = {
  readonly flags: string[];
  readonly notApplied: Declaration[];
};

export type PitNumbers = {
  readonly threads: number;
  readonly timeoutConst: number;
  readonly timeoutFactor: number;
};

export type PitLayers = PitNumbers & {
  readonly mutators: string[];
  readonly lists: Record<string, string[]>;
  readonly notApplied: Declaration[];
};

export type SpotbugsLayers = {
  readonly effort: string;
  readonly threshold: string;
  readonly filters: Declaration[];
  readonly notApplied: Declaration[];
};
