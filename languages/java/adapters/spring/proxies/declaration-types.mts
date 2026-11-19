export type TypeDeclaration = {
  readonly name: string;
  readonly annotation: boolean;
  readonly index: number;
  readonly open: number;
  readonly close: number;
  readonly annotations: string[];
  readonly qualified: string;
};

export type JavaResolver = (name: string) => string[];

export type RawDeclaration = Omit<TypeDeclaration, 'qualified'>;
