export type Bounds = {
  readonly max?: number | undefined;
  readonly min?: number | undefined;
  readonly maximum?: number | undefined;
  readonly unresolved?: true;
};

export type CombinedBounds = {
  readonly unresolved: boolean;
  readonly max: number | undefined;
  readonly min: number | undefined;
  readonly maximum: number | undefined;
};

export type AnyBounds = Bounds | CombinedBounds;

export type FactKind = 'column' | 'validation' | 'spec' | 'field' | 'enum';

export type Fact = {
  readonly kind: FactKind;
  readonly entities: string[];
  readonly fields: string[];
  readonly label: string;
  readonly file: string;
  readonly line: number;
  readonly style: string | undefined;
  readonly width: number | undefined;
  readonly bounds: AnyBounds;
};

export type ColumnFact = Fact & { readonly width: number };

export type Difference = {
  readonly label: string;
  readonly specValue: number;
  readonly validationValue: number;
};

export type ReadText = (file: string) => string | undefined;

export type Literal = string | number | boolean | undefined;

export type ParsedArguments = {
  readonly named: Map<string, Literal>;
  readonly positional: Literal[];
};

export type Annotation = {
  readonly name: string;
  readonly args: ParsedArguments;
  readonly raw: string;
};

export type PositionedAnnotation = Annotation & { readonly index: number; readonly end: number };

export type DeclaredField = {
  readonly name: string;
  readonly type: string;
  readonly annotations: readonly Annotation[];
  readonly line: number;
};

export type LocatedField = DeclaredField & { readonly file: string };

export type ClassRecord = {
  readonly name: string;
  readonly file: string;
  readonly parent: string | undefined;
  readonly annotations: readonly Annotation[];
  readonly fields: readonly DeclaredField[];
};

export type FileFacts = {
  readonly jvm?: ClassRecord[];
  readonly typescript?: ClassRecord[];
  readonly enums?: string[];
  readonly facts?: Fact[];
};

export type ColumnDeclaration = {
  readonly table: string;
  readonly column: string;
  readonly width: number | undefined;
  readonly file: string;
  readonly line: number;
};

export type LengthRange = { readonly min: number; readonly max: number };

export type PendingColumn = {
  readonly table: string | undefined;
  readonly column: string | undefined;
  readonly width: number | undefined;
  readonly file: string;
  readonly line: number;
};
