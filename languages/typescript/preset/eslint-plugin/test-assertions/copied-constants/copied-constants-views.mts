import { byText as untypedByText } from '../../../../../../shared/text-order/by-text.mjs';
import {
  copiedConstantData as untypedCopiedConstantData,
  copiedConstantTemplate as untypedCopiedConstantTemplate,
  isConstantName as untypedIsConstantName,
  isTrivialValue as untypedIsTrivialValue,
  valueKey as untypedValueKey,
} from '../../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { resolveModuleSpecifier as untypedResolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { readStamped as untypedReadStamped } from '../../../modules/stamped-file-cache.mjs';
import { DEFAULT_EXPORT as untypedDefaultExport } from '../../../syntax/exported-components.mjs';

export type ConstantValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number };

type Resolution = { readonly kind: string; readonly path?: string | undefined };

type StampedCache<Value> = Map<string, { readonly stamp: string; readonly value: Value }>;

export const DEFAULT_EXPORT: string = untypedDefaultExport;

export const byText: (left: string, right: string) => number = untypedByText;

export const isConstantName: (name: string) => boolean = untypedIsConstantName;

export const isTrivialValue: (literal: ConstantValue) => boolean = untypedIsTrivialValue;

export const valueKey: (literal: ConstantValue) => string = untypedValueKey;

export const copiedConstantTemplate: (kind: ConstantValue['kind'], pin: string) => string =
  untypedCopiedConstantTemplate;

export const copiedConstantData: (details: {
  readonly names: readonly string[];
  readonly owner: string;
  readonly literal: ConstantValue;
}) => Readonly<Record<string, unknown>> = untypedCopiedConstantData;

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolveModuleSpecifier;

export function resolvedFile(written: string, containingFile: string): string | undefined {
  const target = resolveModuleSpecifier(written, containingFile);
  return target.kind === 'file' ? target.path : undefined;
}

export const readStamped: <Value>(
  cache: StampedCache<Value>,
  file: string,
  read: (file: string) => Value,
) => Value | undefined = untypedReadStamped;
