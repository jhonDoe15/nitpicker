import type { RecordedCall } from './fake-call.mts';
import type { ToolContext, ToolContextOptions } from './tool-context.mts';

export type Files = Readonly<Record<string, string>>;
export type ContextExtras = Omit<
  ToolContextOptions,
  'projectRoot' | 'liveRoot' | 'settings' | 'reportRoot' | 'exclude'
>;
export type Settings = Readonly<Record<string, unknown>>;
export type FakeProjects = {
  readonly temporaryRoot: () => string;
  readonly project: (files?: Files, options?: { readonly tools?: readonly string[] }) => string;
  readonly contextFor: (
    root: string,
    settings?: Settings,
    options?: ContextExtras,
  ) => { readonly context: ToolContext; readonly reportRoot: string };
  readonly calls: (logFile: string) => RecordedCall[];
  readonly cleanup: () => void;
};
export type ScratchProject = {
  readonly root: string;
  readonly reportRoot: string;
  readonly context: ToolContext;
};
export type Scratch = {
  readonly directory: () => string;
  readonly write: (root: string, files: Files) => string;
  readonly setEnvironment: (name: string, value: string | undefined) => void;
  readonly project: (options?: {
    readonly files?: Files;
    readonly tools?: readonly string[];
  }) => ScratchProject;
  readonly cleanup: () => void;
};
