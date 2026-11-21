export type Enforcement = boolean | 'partial' | 'own-tool' | 'reported';

export type LanguageColumns = Readonly<Record<string, Enforcement | undefined>>;

export type RuleEntry = {
  readonly id: string;
  readonly check: string;
  readonly limit: string;
  readonly enforcedBy?: LanguageColumns;
  readonly notApplicable?: Readonly<Record<string, string>>;
  readonly reportOnly?: true;
};

export type ColumnedRule = RuleEntry & { readonly enforcedBy: LanguageColumns };

export type Allowed = (text: string) => string;

type ColumnsWithKotlin = (columns: LanguageColumns, kotlin: boolean) => LanguageColumns;

type ColumnsWithGo = (columns: LanguageColumns) => LanguageColumns;

export type SizeColumns = {
  readonly all: LanguageColumns;
  readonly withKotlin: ColumnsWithKotlin;
  readonly withGo: ColumnsWithGo;
};

export type CouplingColumns = {
  readonly everyLanguage: LanguageColumns;
  readonly withoutGo: LanguageColumns;
};

export type RuleKeys<Source> = { readonly [Key in keyof Source]: string };
