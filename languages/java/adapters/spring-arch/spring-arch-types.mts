export type ArchViolation = {
  readonly rule: string;
  readonly className: string;
  readonly detail: string;
  readonly fileName: string;
};

export type ArchTarget = { readonly packageName: string; readonly rootPackage: string };

type ArchMessageArguments = {
  readonly simple: string;
  readonly detail: string;
  readonly root: string;
  readonly target: ArchTarget;
};

export type ArchMessage = (parts: ArchMessageArguments) => string;

export type ArchEntry = { readonly key: string; readonly symbol: string; readonly message: string };

export type ArchOptions = {
  readonly resolvePath: (className: string, fileName: string | undefined) => string | undefined;
  readonly isExcepted?: ((rule: string, file: string | undefined) => boolean) | undefined;
  readonly isFeatureFace?: ((file: string) => boolean) | undefined;
  readonly spring?: false;
};

export type ArchKeptOptions = ArchOptions & { readonly shown: ReadonlySet<string> };

export type ArchFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly allowedForm: string;
  readonly classification: string;
  readonly symbol: string;
};
