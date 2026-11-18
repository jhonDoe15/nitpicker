import type { XmlElement } from '../../../../shared/values/xml.mts';

export type RuleReference = { readonly file: string; readonly rule: string | undefined };

type RuleDefinition = {
  readonly file: string;
  readonly element: XmlElement;
  readonly testOnly?: true;
  readonly mainOnly?: true;
};

export type RuleCatalog = {
  readonly definitions: Map<string, RuleDefinition>;
  readonly covers: Map<string, Set<string>>;
  readonly mainCovers: Map<string, Set<string>>;
};

type NamedRule = readonly [string, XmlElement];

export type ProjectSplit = {
  readonly kept: XmlElement[];
  readonly replaced: string[];
  readonly main?: NamedRule[];
  readonly tests?: NamedRule[];
};

export type ProjectLayer = {
  readonly tests: Map<string, XmlElement>;
  readonly main: Map<string, XmlElement>;
  readonly replaced: string[];
  readonly ruleset: XmlElement;
};

export type PmdLayerInput = {
  readonly nitpickerPath: string;
  readonly nitpickerText: string;
  readonly testText: string;
  readonly mainPath: string;
  readonly mainText: string;
  readonly projectText: string | undefined;
  readonly projectWins: boolean;
  readonly assertionHelpers?: readonly string[];
};

export type LayerFilesOptions = {
  readonly project?: string | undefined;
  readonly projectWins: boolean;
  readonly assertionHelpers?: readonly string[];
  readonly directory: string;
};

export type PmdLayers = {
  readonly tests: string | undefined;
  readonly main: string | undefined;
  readonly nitpicker: string;
  readonly project: string | undefined;
  readonly replaced: string[];
};

export type PmdLayerFiles = {
  readonly nitpicker: string | undefined;
  readonly project: string | undefined;
  readonly tests: string | undefined;
  readonly main: string | undefined;
};

type PmdChoice = {
  readonly project?: string | undefined;
  readonly projectWins: boolean;
  readonly assertionHelpers?: readonly string[];
};

export type ProjectChoice = {
  readonly project: string | undefined;
  readonly projectWins: boolean;
  readonly assertionHelpers?: readonly string[];
};

export type RulesetsOptions = {
  readonly module: {
    readonly sourceRoots: readonly string[];
    readonly testSourceRoots: readonly string[];
  };
  readonly reportDir: string;
  readonly configs: { readonly pmd?: PmdChoice };
  readonly spring: boolean;
  readonly springData: boolean;
  readonly springRules: string | undefined;
  readonly reactor?: true;
};

export type PropertyDirectories = { readonly directory: string; readonly checkstyleBase: string };
