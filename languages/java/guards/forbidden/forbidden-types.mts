export type Declaration = { readonly kind: string; readonly member: string };

export type ForbiddenUse = {
  readonly signature: string;
  readonly rule: string;
  readonly text: string;
  readonly className: string;
  readonly fileName: string;
  readonly file: string;
  readonly line?: number;
  readonly declaration?: Declaration;
};

export type DeclaredUse = ForbiddenUse & { readonly declaration: Declaration };

export type TextOf = (file: string) => string | undefined;
