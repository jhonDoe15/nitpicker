import type { ConventionDefinition } from '../../../shared/values/config-types.mts';
import { FILE_NAME_CONVENTION as UNTYPED_FILE_NAME_CONVENTION } from './file-name-casing.mjs';
import { ASSERTION_HELPERS_CONVENTION } from './measures/assertion-functions.mts';
import { DATA_CONVENTIONS } from './measures/data-conventions.mts';
import { DETACHED_WORK_RUNNERS_CONVENTION } from './measures/detached-work-runners.mts';
import { JSX_CONVENTIONS as UNTYPED_JSX_CONVENTIONS } from './measures/jsx-conventions.mjs';
import { SOFT_DELETE_FILTERS_CONVENTION as UNTYPED_SOFT_DELETE_FILTERS_CONVENTION } from './measures/database/soft-delete-filters.mts';
import { TRANSACTIONS_CONVENTION as UNTYPED_TRANSACTIONS_CONVENTION } from './measures/database/transactions.mts';
import { ROUTE_AUTH_CONVENTION as UNTYPED_ROUTE_AUTH_CONVENTION } from './measures/routes/route-auth.mts';
import { PRETTIER_CONVENTIONS } from './typed/convention-views.mts';
import { TYPE_IMPORT_CONVENTION } from './type-import-style.mts';

const FILE_NAME_CONVENTION: ConventionDefinition = UNTYPED_FILE_NAME_CONVENTION;
const JSX_CONVENTIONS: readonly ConventionDefinition[] = UNTYPED_JSX_CONVENTIONS;
const TRANSACTIONS_CONVENTION: ConventionDefinition = UNTYPED_TRANSACTIONS_CONVENTION;
const SOFT_DELETE_FILTERS_CONVENTION: ConventionDefinition = UNTYPED_SOFT_DELETE_FILTERS_CONVENTION;
const ROUTE_AUTH_CONVENTION: ConventionDefinition = UNTYPED_ROUTE_AUTH_CONVENTION;

const SHARED_CONVENTIONS = [
  ...PRETTIER_CONVENTIONS,
  ...DATA_CONVENTIONS,
  FILE_NAME_CONVENTION,
  ASSERTION_HELPERS_CONVENTION,
  DETACHED_WORK_RUNNERS_CONVENTION,
  TRANSACTIONS_CONVENTION,
  SOFT_DELETE_FILTERS_CONVENTION,
  ROUTE_AUTH_CONVENTION,
];

export const JAVASCRIPT_CONVENTIONS = SHARED_CONVENTIONS;
export const TYPESCRIPT_CONVENTIONS = [
  ...SHARED_CONVENTIONS,
  ...JSX_CONVENTIONS,
  TYPE_IMPORT_CONVENTION,
];
