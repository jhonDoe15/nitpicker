import type TypeScript from 'typescript';
import {
  isExported as untypedIsExported,
  scriptKindOf as untypedScriptKindOf,
} from '../../../../modules/module-sources.mts';
import { readStamped as untypedReadStamped } from '../../../../modules/stamped-file-cache.mts';

export type StampedCache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

export const isExported: (statement: TypeScript.Node) => boolean = untypedIsExported;
export const scriptKindOf: (file: string) => TypeScript.ScriptKind = untypedScriptKindOf;
export const readStamped: <Value>(
  cache: StampedCache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;
