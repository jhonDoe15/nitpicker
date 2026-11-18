import type { Span } from '../../../../adapters/near-duplicates/extract-types.mts';
import { lineAt as untypedLineAt } from '../../../../../../shared/conventions/lines.mjs';
import { escapeRegExp as untypedEscapeRegExp } from '../../../../../../shared/paths/glob.mjs';
import {
  afterGroup as untypedAfterGroup,
  braceDepths as untypedBraceDepths,
  closingIndex as untypedClosingIndex,
  enclosingOpen as untypedEnclosingOpen,
  literalAt as untypedLiteralAt,
  scanKotlinSource as untypedScanKotlinSource,
  splitArguments as untypedSplitArguments,
} from '../../../../adapters/kotlin/scan/kotlin-source.mjs';

export const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
export type { Span };

export type KotlinEdit = Span & { readonly text: string };

export type KotlinLiteral = Span & {
  readonly bodyStart: number;
  readonly text: string;
  readonly template: boolean;
  readonly raw: boolean;
};

type KotlinComment = Span & { readonly kind: string; readonly text: string };

export type ScannedKotlin = {
  readonly source: string;
  readonly code: string;
  readonly contextCode: string;
  readonly literals: readonly KotlinLiteral[];
  readonly comments: readonly KotlinComment[];
  readonly lineStarts: readonly number[];
};

export type KotlinFound = {
  readonly rule?: string;
  readonly offset: number;
  readonly edits: readonly KotlinEdit[];
};

export type KotlinMarker = {
  readonly rule: string;
  readonly offset: number;
  readonly subject: string;
  readonly end: number;
};

export const lineAt: (text: string, index: number) => number = untypedLineAt;

export const braceDepths: (code: string) => Int32Array = untypedBraceDepths;

export const closingIndex: (code: string, open: number) => number = untypedClosingIndex;
export const afterGroup: (code: string, at: number, opening: RegExp) => number = untypedAfterGroup;

export const enclosingOpen: (code: string, offset: number, opener?: string) => number =
  untypedEnclosingOpen;

export const literalAt: (scanned: ScannedKotlin, offset: number) => KotlinLiteral | undefined =
  untypedLiteralAt;

export const scanKotlinSource: (source: string) => ScannedKotlin = untypedScanKotlinSource;

export const splitArguments: (
  code: string,
  open: number,
) => { readonly close: number; readonly parts: readonly Span[] } = untypedSplitArguments;
