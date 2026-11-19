import type {
  Check,
  Located,
  Literal,
  Messaged,
  Ruled,
  Scanned,
  Subjected,
} from './scan-shapes.mts';
import { escapeRegExp as untypedEscape } from '../../../../../../shared/paths/glob.mjs';
import {
  chainOf as untypedChainOf,
  depthFirst as untypedDepthFirst,
} from '../../../../../../shared/traversal.mjs';
import { lineOf as untypedLineOf, scanKotlinSource as untypedScan } from '../kotlin-source.mts';

export const scanKotlinSource: (source: string) => Scanned = untypedScan;

export const chainFrom: <T>(start: T | undefined, next: (value: T) => T | undefined) => T[] =
  untypedChainOf;

export const depthFirst: <T>(root: T, children: (node: T) => T[]) => Iterable<T> =
  untypedDepthFirst;

export const escapeRegExp: (value: string) => string = untypedEscape;

export const lineOf: (scanned: Scanned, offset: number) => number = untypedLineOf;

export type { Check, Located, Literal, Messaged, Ruled, Scanned, Subjected };
