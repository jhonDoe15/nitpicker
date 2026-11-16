import type { ConventionSource } from '../../../../core/conventions/typed/convention-types.mts';
import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';

export type Formatter = string;

type SettingsBase = {
  readonly file: string;
  readonly set: Readonly<Record<string, string | number>>;
};

export type FormatterSettings = SettingsBase | (SettingsBase & { readonly hasTable: boolean });

export type StyleInput = {
  readonly config: NitpickerConfig;
  readonly projectRoot: string;
  readonly source?: ConventionSource | undefined;
  readonly configRoot?: (() => { readonly path: string }) | undefined;
};
