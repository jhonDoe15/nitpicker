import { FILE_NAME_CONVENTION } from './file-name-casing.mjs';
import { ASSERTION_HELPERS_CONVENTION } from './measures/assertion-helpers.mjs';
import { DATA_CONVENTIONS } from './measures/data-conventions.mjs';
import { JSX_CONVENTIONS } from './measures/jsx-conventions.mjs';
import { PRETTIER_CONVENTIONS } from './prettier-conventions.mjs';
import { TYPE_IMPORT_CONVENTION } from './type-import-style.mjs';

const SHARED_CONVENTIONS = [
  ...PRETTIER_CONVENTIONS,
  ...DATA_CONVENTIONS,
  FILE_NAME_CONVENTION,
  ASSERTION_HELPERS_CONVENTION,
];

export const JAVASCRIPT_CONVENTIONS = SHARED_CONVENTIONS;
export const TYPESCRIPT_CONVENTIONS = [
  ...SHARED_CONVENTIONS,
  ...JSX_CONVENTIONS,
  TYPE_IMPORT_CONVENTION,
];
