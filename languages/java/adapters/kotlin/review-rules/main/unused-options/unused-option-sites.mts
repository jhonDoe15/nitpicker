import type { KotlinFile, ParameterFact } from '../../typed/kotlin-fact-types.mts';
import type { CallFact, Declaration } from './unused-option-types.mts';

export type ReachSite = {
  file: KotlinFile;
  qualifier?: string | undefined;
  typeAliases?: Set<string>;
};

export type SiteCall = CallFact & {
  origin: KotlinFile;
  aliased: boolean;
  typeAliases: Set<string>;
};

export type OptionUnit = {
  file: string;
  callee: string;
  label: string;
  limited: boolean;
  internal: boolean;
  data: boolean;
  parameters: ParameterFact[];
  line: number;
  declaration: Declaration;
};

export type CallerNote = {
  reportRoot: string;
  unit: OptionUnit;
  kinds: string;
  gaps: string[];
};
