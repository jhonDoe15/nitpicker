export type Finding = {
  readonly classification?: string;
  readonly tool: string;
  readonly rule: string;
  readonly symbol: string;
  readonly message: string;
};
export type StructureFunction = {
  readonly file: string;
  readonly name: string;
  readonly start: number;
  readonly definition: number;
  readonly bodyStart: number;
  readonly end: number;
  readonly lines: number;
  readonly statements: number;
  readonly maxControlNesting: number;
  readonly parameters: number;
  readonly complexity: number;
};
