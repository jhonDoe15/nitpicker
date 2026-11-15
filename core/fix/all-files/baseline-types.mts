import { writeTexts as untypedWriteTexts } from '../engine/write-texts.mjs';
import {
  fieldOf,
  fieldsOf,
  listOf,
  numberOr,
  parseJson,
  textOf,
} from '../../../shared/values/readers.mts';
import type { FixWriter } from '../typed/fix-types.mts';

export type Site = {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly file: string;
  readonly rule: string;
  readonly count: number;
};

export type Counts = ReadonlyMap<string, number>;

export type Change = {
  readonly file: string;
  readonly rule: string;
  readonly from: number;
  readonly to: number;
};

export type Current = {
  readonly bytes: Buffer;
  readonly original: string;
  readonly inventory: unknown;
  readonly sites: readonly Site[];
};

export type Lowered = {
  readonly notes: readonly string[];
  readonly changed: readonly string[];
  readonly errors: readonly string[];
};

export type Plan = {
  readonly writer: FixWriter;
  readonly name: string;
  readonly current: Current;
  readonly counts: Counts;
  readonly selectedRules: readonly string[];
};

export type WriteRequest = {
  readonly writer: FixWriter;
  readonly name: string;
  readonly current: Current;
  readonly kept: readonly Site[];
};

export type Untouched = {
  readonly sites: readonly Site[];
  readonly selectedRules: readonly string[];
  readonly counts: Counts;
};

export type Request = {
  readonly projectRoot: string;
  readonly writer: FixWriter;
  readonly config: unknown;
  readonly selectedRules: readonly string[];
  readonly fixedFindings: readonly string[];
};

export const writeTexts: (
  writer: FixWriter,
  planned: readonly { readonly name: string; readonly bytes: Buffer; readonly text: string }[],
  tool: string,
) => { readonly written: readonly string[]; readonly unwritable: readonly string[] } =
  untypedWriteTexts;

export function keyParts(key: string): readonly [string, string] {
  const parts = listOf(parseJson(key));
  return [textOf(parts[0]), textOf(parts[1])];
}

export function sitesOf(inventory: unknown): Site[] {
  return listOf(fieldOf(inventory, 'sites')).map((site) => ({
    raw: fieldsOf(site),
    file: textOf(fieldOf(site, 'file')),
    rule: textOf(fieldOf(site, 'rule')),
    count: numberOr(fieldOf(site, 'count'), Number.NaN),
  }));
}

export { fieldsOf as inventoryFields };

export function configuredInventory(config: unknown): string | undefined {
  const name = fieldOf(config, 'legacyInventory');
  return name === undefined ? undefined : textOf(name);
}

export function reduced(site: Site, cut: number): Site {
  return { ...site, raw: { ...site.raw, count: site.count - cut }, count: site.count - cut };
}
