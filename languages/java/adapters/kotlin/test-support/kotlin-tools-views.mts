import {
  kotlinGradleArguments as untypedKotlinGradleArguments,
  kotlinStyleFile as untypedKotlinStyleFile,
  resolveKotlinTools as untypedResolveKotlinTools,
} from '../kotlin-tools.mjs';

type Workspace = {
  offset: string;
  editorconfigs: { path: string; text: string }[];
};

export type ToolOptions = {
  formatter?: string;
  detektConfig?: string | undefined;
  snapshot?: string;
  conventions?: Record<string, string>;
  policyRoot?: string;
  toolPrecedence?: Record<string, string[]>;
};

export type Tools = {
  formatter: string;
  ktfmtStyle?: string | undefined;
  detektConfig?: string | undefined;
  detektIgnored?: string | undefined;
  workspace?: Workspace | undefined;
  editorconfigIgnored?: unknown;
  editorconfigFiles?: unknown[] | undefined;
  ktfmtEditorconfig?: unknown;
};

type StyleFile = Workspace & {
  ktlintDefaults?: string;
  detektConventions?: string;
};

export const resolveKotlinTools: (projectRoot: string, options?: ToolOptions) => Tools =
  untypedResolveKotlinTools;

export const kotlinStyleFile: (
  tools: Tools,
  conventions: Record<string, string>,
) => StyleFile | undefined = untypedKotlinStyleFile;

export const kotlinGradleArguments: (
  projectRoot: string,
  options: ToolOptions & { styleFile?: string },
) => string[] = untypedKotlinGradleArguments;
