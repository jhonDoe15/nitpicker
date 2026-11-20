import type { createQualityChecks } from '../../preset/quality-checks.mts';

export type Layout = NonNullable<Parameters<typeof createQualityChecks>[0]>;
