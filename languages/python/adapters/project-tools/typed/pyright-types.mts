import type { Fields } from '../../../../../shared/values/readers.mts';

export type PyrightRead = { readonly config: Fields; readonly table?: string | undefined };

export type PyrightLink = {
  readonly file: string;
  readonly table: string | undefined;
  readonly config: Fields;
};

export type ProjectPyright = {
  readonly file: string;
  readonly files: string[];
  readonly table: string | undefined;
  readonly config?: Fields;
  readonly unreadable?: string | undefined;
};

export type PyrightChain = {
  readonly links: PyrightLink[];
  readonly files: string[];
  readonly unreadable?: string | undefined;
};

export type PyrightOptions = { readonly upward: boolean; readonly projectRoot?: string };

export type Rebase = (directory: string) => string;
