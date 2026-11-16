import type { ToolContext as SharedToolContext } from '../../typed/context/tool-context-types.mts';

export type { TomlTable } from '../../configuration/project-files.mts';

export type ToolContext = Pick<SharedToolContext, 'projectRoot' | 'policyRoot' | 'toolPrecedence'>;

export type Attempt<T> =
  | { readonly value: T; readonly error?: undefined }
  | { readonly value?: undefined; readonly error: unknown };

export type ProjectConfigRequest = {
  readonly tool: string;
  readonly looked: string;
  readonly configRoot: string;
};

export type ToolLayers = {
  readonly optedIn: boolean;
  readonly appliesProject: boolean;
  readonly nitpickerFirst: boolean;
  readonly configRoot: string;
};

export type FailWith = (message: string) => Error;

export type MutmutContext = Pick<
  SharedToolContext,
  'projectRoot' | 'policyRoot' | 'toolPrecedence' | 'exclude' | 'mutationScope' | 'project'
>;

export type MutmutConfig = {
  readonly file: string;
  readonly table: Readonly<Record<string, unknown>>;
};
