import type { ChoiceConvention } from '../../../../shared/values/config-types.mts';

export type ChosenOptions = Readonly<Record<string, unknown>>;

export type Chooser = (id: string, mapping: (value: string) => ChosenOptions) => ChosenOptions;

type Measure = (text: string, file: string) => string | undefined;

export type ChoiceDefinition = ChoiceConvention & {
  readonly fallback: string;
  readonly measure: Measure;
};

export type ChoiceInput = Omit<ChoiceDefinition, 'options' | 'files' | 'optionLabels'> & {
  readonly optionLabels: Readonly<Record<string, string>>;
};
