type TokenKind =
  'word' | 'op' | 'string' | 'piece' | 'number' | 'regex' | 'comment' | 'continuation' | 'layout';

export type Token = {
  readonly kind: TokenKind;
  readonly text: string;
  readonly line: number;
  readonly joined?: true;
  readonly template?: true;
  readonly headerClose?: true;
  readonly inlineBody?: true;
};

export type NewToken = Omit<Token, 'line'> & { readonly line?: number };

export type AlignToken = { readonly text: string; readonly line: number };

export type StringKind = {
  readonly multiline: boolean;
  readonly escapes: boolean;
  readonly close: string;
  readonly interpolation?: string;
  readonly doubledBraces?: true;
  readonly block?: true;
  readonly template?: true;
};

export type LanguageName = 'python' | 'javascript' | 'java' | 'kotlin' | 'go';

export type SourceLanguage = {
  readonly name: LanguageName;
  readonly operators: RegExp;
  readonly strings: {
    readonly start: RegExp;
    readonly kinds: Readonly<Record<string, StringKind>>;
  };
  readonly lineComment: string;
  readonly blockComment?: true;
  readonly nestedComments?: true;
  readonly quoteAgnostic?: true;
  readonly regexLiterals?: true;
};

export type ScanCursor = {
  readonly text: string;
  readonly language: SourceLanguage;
  readonly tokens: Token[];
  at: number;
  line: number;
  previous: Token | undefined;
};

export type StringLiteral = {
  readonly raw: string;
  readonly prefix: string;
  readonly opener: string;
  readonly kind: StringKind;
};

export type StatementRules = {
  readonly restricted: ReadonlySet<string>;
  readonly statementWords: ReadonlySet<string>;
  readonly operandEnds: ReadonlySet<string>;
  readonly continuation: ReadonlySet<string>;
  readonly taggedTemplates: boolean;
  readonly headers: ReadonlySet<string>;
  readonly emptyBodies: ReadonlySet<string>;
};

export type LayoutState = {
  readonly out: Token[];
  readonly pending: Token[];
  previous: Token | undefined;
};

export type PythonLayoutState = LayoutState & {
  readonly stack: number[];
  readonly lines: readonly string[];
  depth: number;
  logicalStart: boolean;
  continued: boolean;
  header: boolean;
  lambdas: number;
  colonLine: number | undefined;
};

export type StatementLayoutState = LayoutState & {
  readonly parens: boolean[];
  readonly rules: StatementRules;
};

export type DescribedLine = {
  readonly scope: string;
  readonly level: number;
  readonly tokens: readonly string[];
  readonly key: string;
};

export type LineDescription = {
  readonly scope: string;
  readonly level: number;
  readonly tokens: string[];
};

export type DescribeState = {
  readonly stack: string[];
  readonly lines: LineDescription[];
  header: string[];
  lineStart: boolean;
  pending: string | undefined;
};

export type MovedContext = {
  readonly sides: {
    readonly base: readonly (DescribedLine | undefined)[];
    readonly head: readonly (DescribedLine | undefined)[];
  };
  readonly inBase: ReadonlySet<number>;
  readonly inHead: ReadonlySet<number>;
  readonly anchorOf: (line: number) => number;
};
