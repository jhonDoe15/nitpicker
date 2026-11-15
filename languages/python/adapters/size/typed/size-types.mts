import { classLimitFindings as untypedClassLimits } from '../../../../../shared/rules/size/class-limits.mjs';
import { folderDepthFindings as untypedFolderDepth } from '../../../../../shared/rules/size/folder-depth.mjs';
import type { IngestedFinding } from '../../../ingest/typed/ingest-types.mts';
import type {
  ClassEntry,
  OtherModule,
  PythonModule,
} from '../../analysis/typed/python-graph-types.mts';

export type SizeFinding = IngestedFinding;
export type Depths = Map<string | undefined, number>;
export type Resolve = (entry: ClassEntry, written: string) => ClassEntry | undefined;
export type InheritanceDepth = (entry: ClassEntry) => number | undefined;
export type Hierarchy = {
  readonly parents: Map<ClassEntry, ClassEntry[]>;
  readonly children: Map<ClassEntry, ClassEntry[]>;
  readonly waiting: Map<ClassEntry, number>;
};
export type SettleContext = {
  readonly graph: Hierarchy;
  readonly depths: Map<ClassEntry, number>;
  readonly enqueue: (entry: ClassEntry) => void;
};
export type DepthEntry = { readonly path: string; readonly kind: string; readonly parts: string[] };
export type DepthOptions = {
  readonly thresholds?: { readonly folderDepth?: number };
  readonly exceptions?: readonly unknown[];
  readonly tests?: readonly Pick<OtherModule, 'file' | 'kind'>[];
  readonly sourceRoots?: readonly string[];
  readonly rootModules?: readonly PythonModule[];
};
export type ClassLimitOptions = {
  readonly thresholds?: Readonly<Record<string, unknown>> | undefined;
  readonly exceptions?: readonly unknown[] | undefined;
};

type FolderDepthOptions = {
  analyzerName: string;
  limit: number;
  exceptions: readonly unknown[] | undefined;
  wording: { subject: string; below: string; advice: (limit: number) => string };
  depthOf: (entry: DepthEntry) => number;
};

export const folderDepthFindings: (
  entries: readonly DepthEntry[],
  options: FolderDepthOptions,
) => SizeFinding[] = untypedFolderDepth;

export const classLimitFindings: (
  classes: readonly (ClassEntry & { readonly inheritanceDepth: number | undefined })[],
  options: { analyzerName: string } & ClassLimitOptions,
) => SizeFinding[] = untypedClassLimits;
