import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type { Fields } from '../../../../../shared/values/readers.mts';

export type CoverageProjectFile = {
  readonly name: string;
  readonly prefixes: readonly string[];
  readonly label: string;
};

export type CoverageSections = {
  readonly run: Fields;
  readonly report: Fields;
};

export type CoverageSettings = CoverageSections & { readonly label: string };

export type FoundCoverage = CoverageSettings & { readonly file: string };

export type UnreadableCoverage = { readonly file: string; readonly unreadable: string };

export type OptedSettings = {
  readonly run: [string, string | string[]][];
  readonly excluded: string[];
  readonly partial: string[];
  readonly omit: string[];
  readonly reportOmit: string[];
};

export type CoverageContext = Pick<ToolContext, 'projectRoot' | 'reportRoot'> &
  Partial<Pick<ToolContext, 'policyRoot' | 'toolPrecedence'>>;
