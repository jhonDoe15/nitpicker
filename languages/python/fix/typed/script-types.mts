import type { NamedFile, PlanFile } from './fix-types.mts';

export type ScriptOptions = Readonly<Record<string, unknown>>;

export type ScriptSettings = {
  readonly runScript: (input: string) => string;
  readonly optionsFor: (files: readonly NamedFile[]) => ScriptOptions;
};

export type ProjectPayload = {
  readonly files: { path: string; text: string; editable: boolean }[];
  readonly texts: string[];
  readonly targets: string[];
};

export type ProjectPayloadInput = {
  readonly projectRoot: string;
  readonly files: readonly PlanFile[];
  readonly read: (name: string) => string | undefined;
  readonly accepts: (name: string) => boolean;
};
