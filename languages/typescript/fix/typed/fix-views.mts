import type { createQualityChecks } from '../../preset/quality-checks.mjs';

export type Layout = NonNullable<Parameters<typeof createQualityChecks>[0]>;
