import {
  createIdentities as untypedCreateIdentities,
  withoutLineNumbers as untypedWithoutLineNumbers,
} from '../identities.mjs';
import {
  ingestMypy as untypedIngestMypy,
  ingestPyright as untypedIngestPyright,
} from '../type-check.mjs';
import type { IngestedFinding } from './ingest-types.mts';

type Roots = readonly (string | undefined)[];
type IdentityParts = { path: string; rule: string; subject: string };

export const withoutLineNumbers: (subject: string) => string = untypedWithoutLineNumbers;

export const createIdentities: () => (parts: IdentityParts) => string = untypedCreateIdentities;

export const ingestMypy: (text: string, options: { roots: Roots }) => IngestedFinding[] =
  untypedIngestMypy;

export const ingestPyright: (
  text: string,
  options: { roots: Roots; tool?: string },
) => IngestedFinding[] = untypedIngestPyright;
