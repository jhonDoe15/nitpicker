import type { Conventions } from '../style/kotlin-style-files.mts';
import type { Workspace } from '../style/editorconfig-mirror.mts';

export type ToolPrecedence = Readonly<Record<string, string[] | undefined>>;
export type ToolOptions = {
  formatter?: string | undefined;
  detektConfig?: string | undefined;
  snapshot?: string | undefined;
  conventions?: Conventions;
  policyRoot?: string | undefined;
  toolPrecedence?: ToolPrecedence;
  effectivePom?: string | undefined;
  facts?: unknown;
  styleFile?: string | undefined;
};
type StyleFlags = { editorconfigIgnored: boolean; ktfmtEditorconfig: boolean };
export type ProjectStyle = StyleFlags & {
  workspace?: Workspace | undefined;
  editorconfigFiles?: string[] | undefined;
};
export type DetektSettings = {
  detektConfig: string | undefined;
  detektNitpickerFirst: boolean;
  detektIgnored?: string | undefined;
};
export type KotlinTools = ProjectStyle &
  DetektSettings & { formatter: string; ktfmtStyle: string; ktfmtMaxWidth: string | undefined };
export type StyleFile = Partial<Workspace> & {
  ktlintDefaults?: string;
  detektConventions?: string;
  detektEnforced?: string;
};

export type Roots = { projectRoot: string; configRoot: string };

export type DetektRequest = {
  configRoot: string;
  detektConfig: string | undefined;
  snapshot: string | undefined;
  toolPrecedence: ToolPrecedence;
};

export type StyleFilesConfig = {
  tools?: Readonly<Record<string, { precedence?: string[] }>>;
  kotlin?: { formatter?: string; detektConfig?: string };
};
