import type { Token } from '../../reuse/jvm-reuse-types.mts';

export type Span = { readonly from: number; readonly to: number };

export type NumberKind = 'int' | 'long';

export type Param = { readonly name: string; readonly defaultValue?: Span };

export type OpenFrame = { readonly open: number; readonly body: Span };

export type Frame = OpenFrame & { readonly name: string; readonly params: Param[] };

export type BareSource = {
  readonly file: string;
  readonly kotlin: boolean;
  readonly tokens: readonly Token[];
  readonly partner: Int32Array;
  readonly opener: Int32Array;
};

export type SourceFile = BareSource & { readonly frames: Frame[] };

export type Mark = {
  readonly callee: string | undefined;
  readonly name?: string;
  readonly position?: number;
  readonly count?: number;
  readonly kind: NumberKind;
};

export type KindMap = Map<string, NumberKind>;

export type CarrierState = {
  readonly frames: Map<Frame, KindMap>;
  readonly files: Map<string, KindMap>;
  readonly fields: KindMap;
  readonly topLevel: KindMap;
  marks: Mark[];
  size: number;
  readonly remember: (map: KindMap, key: string, kind: NumberKind) => void;
};

export type Ref = {
  readonly name: string;
  readonly qualifier: string;
  readonly max: NumberKind | undefined;
  readonly start: number;
  readonly end: number;
};

export type Context = { readonly source: SourceFile; readonly frame: Frame | undefined };

export type Operand = { readonly name: string; readonly kind: NumberKind };

export type Sum = { readonly operand: Operand; readonly text: string };

export type FoundSum = Sum & { readonly line: number };

export type ForwardStep = { readonly index: number; readonly end: number; readonly group: boolean };

export type BackwardStep = {
  readonly index: number;
  readonly start: number;
  readonly group: boolean;
};
