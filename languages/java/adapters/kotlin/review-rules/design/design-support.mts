import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, textOf, textsOf } from '../../../../../../shared/values/readers.mts';
import { kotlinDesignBundle, kotlinDesignFindings } from './kotlin-design.mts';

export type Item = {
  id?: string;
  kind?: string;
  exported?: unknown;
  published?: unknown;
  entry?: unknown;
  fields?: unknown;
  supertypes?: unknown;
  returns?: unknown;
  returnsField?: unknown;
  references?: unknown;
  params?: unknown;
  calls?: unknown;
};

export type Recorded = { types: Item[]; callables: Item[] };

export type DesignFinding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  symbol: string | undefined;
  message: string;
  classification: string;
};

type Evaluator = (facts: unknown, options: unknown) => unknown[];

export const bundleOf: (facts: Recorded) => { packages: unknown } = kotlinDesignBundle;

function isRecorded(value: unknown): value is Recorded {
  return Array.isArray(fieldOf(value, 'types')) && Array.isArray(fieldOf(value, 'callables'));
}

function isFinding(value: unknown): value is DesignFinding {
  return typeof fieldOf(value, 'rule') === 'string';
}

const FIXTURES = path.resolve(import.meta.dirname, '../../../fixtures');
const RECORDED_FILES = {
  'kotlin-design': path.join(FIXTURES, 'kotlin-design/design-facts.json'),
  'kotlin-design-published': path.join(FIXTURES, 'kotlin-design-published/design-facts.json'),
};

export function recordedFacts(folder: keyof typeof RECORDED_FILES): Recorded {
  const parsed: unknown = JSON.parse(readFileSync(RECORDED_FILES[folder], 'utf8'));
  if (!isRecorded(parsed)) {
    throw new TypeError(`${folder} has no recorded design facts`);
  }
  return parsed;
}

export function designFindings(
  reportRoot: string,
  options: { environment: Record<string, string>; evaluator?: Evaluator },
): DesignFinding[] {
  const found: unknown = Reflect.apply(kotlinDesignFindings, undefined, [reportRoot, options]);
  return listOf(found).filter(isFinding);
}

export function callsOf(item: Item | undefined): unknown[] {
  return [...listOf(item?.calls)];
}

export function callText(call: unknown): string {
  const target = textOf(fieldOf(call, 'target'));
  const receiver = String(fieldOf(call, 'receiver'));
  const cleanup = fieldOf(call, 'cleanup') === true;
  return `${target.slice(target.indexOf('#') + 1)} ${receiver} ${String(cleanup)} ${textsOf(fieldOf(call, 'branch')).join()}`;
}
