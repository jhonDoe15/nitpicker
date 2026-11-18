import type { ToolContext } from '../../typed/context/tool-context-types.mts';
import type { Fields } from '../../../../../shared/values/readers.mts';
import type { IniOptions } from '../ini-parser.mts';
import type { TomlTable } from '../project-files.mts';

type MypyModule = {
  readonly patterns: string[];
  readonly options: Fields;
};

type MypyBase = {
  readonly options: Fields;
  readonly modules: MypyModule[];
};

export type IniMypyModel = MypyBase & {
  readonly format: 'ini';
  readonly others: [string, IniOptions][];
};

export type TomlMypyModel = MypyBase & {
  readonly format: 'toml';
  readonly others: TomlTable;
};

export type MypyModel = IniMypyModel | TomlMypyModel;

export type MypyFile = MypyModel & { readonly file: string };

export type MypyExcludeContext = Pick<
  ToolContext,
  'projectRoot' | 'policyRoot' | 'toolPrecedence' | 'exclude'
>;

export type MypyContext = MypyExcludeContext &
  Pick<ToolContext, 'reportRoot'> & {
    readonly project: { readonly sourceRoots: readonly string[] };
  };

export type MypySettings = {
  readonly projectRoot: string;
  readonly exclude: readonly string[];
  readonly appliesProject: boolean;
  readonly own: ReadonlySet<string>;
};

export type MypySections = {
  readonly options: Record<string, unknown>;
  readonly modules: MypyModule[];
};
