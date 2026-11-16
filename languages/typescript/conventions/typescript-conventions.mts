import type { ConventionDefinition } from '../../../shared/values/config-types.mts';
import { FILE_NAME_CONVENTION as UNTYPED_FILE_NAME_CONVENTION } from './file-name-casing.mjs';
import { ASSERTION_HELPERS_CONVENTION } from './measures/assertion-functions.mts';
import { DATA_CONVENTIONS } from './measures/data-conventions.mts';
import { DETACHED_WORK_RUNNERS_CONVENTION } from './measures/detached-work-runners.mts';
import { JSX_CONVENTIONS as UNTYPED_JSX_CONVENTIONS } from './measures/jsx-conventions.mjs';
import { PRETTIER_CONVENTIONS } from './typed/convention-views.mts';
import { TYPE_IMPORT_CONVENTION } from './type-import-style.mts';

const FILE_NAME_CONVENTION: ConventionDefinition = UNTYPED_FILE_NAME_CONVENTION;
const JSX_CONVENTIONS: readonly ConventionDefinition[] = UNTYPED_JSX_CONVENTIONS;

const SHARED_CONVENTIONS = [
  ...PRETTIER_CONVENTIONS,
  ...DATA_CONVENTIONS,
  FILE_NAME_CONVENTION,
  ASSERTION_HELPERS_CONVENTION,
  DETACHED_WORK_RUNNERS_CONVENTION,
];

export const JAVASCRIPT_CONVENTIONS = SHARED_CONVENTIONS;
export const TYPESCRIPT_CONVENTIONS = [
  ...SHARED_CONVENTIONS,
  ...JSX_CONVENTIONS,
  TYPE_IMPORT_CONVENTION,
];
