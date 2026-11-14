import { FILE_NAME_CONVENTION } from './file-name-casing.mjs';
import { ASSERTION_HELPERS_CONVENTION } from './measures/assertion-helpers.mjs';
import { DATA_CONVENTIONS } from './measures/data-conventions.mjs';
import { DETACHED_WORK_RUNNERS_CONVENTION } from './measures/detached-work-runners.mjs';
import { JSX_CONVENTIONS } from './measures/jsx-conventions.mjs';
import { SOFT_DELETE_FILTERS_CONVENTION } from './measures/database/soft-delete-filters.mjs';
import { TRANSACTIONS_CONVENTION } from './measures/database/transactions.mjs';
import { ROUTE_AUTH_CONVENTION } from './measures/routes/route-auth.mjs';
import { PRETTIER_CONVENTIONS } from './prettier-conventions.mjs';
import { TYPE_IMPORT_CONVENTION } from './type-import-style.mjs';

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
